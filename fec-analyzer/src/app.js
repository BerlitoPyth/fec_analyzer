const express = require('express');
const path = require('path');
const multer = require('multer');
const fileParser = require('./services/fileParser');
const anomalyDetector = require('./services/anomalyDetector');
const fs = require('fs');
const session = require('express-session');
const analyticsHelpers = require('./analyticsHelpers');

const app = express();
const port = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .csv formats are allowed!'), false);
    }
  }
});

// Set up view engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Middleware to parse JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurer la session
app.use(session({
  secret: 'fec-analyzer-secret', // Changer ceci en production
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // Session d'une heure
}));

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/upload', upload.single('fec-file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    // Parse the uploaded file
    const data = await fileParser.parseFile(req.file.path, req.file.mimetype);
    
    // Perform anomaly detection
    const analysis = anomalyDetector.analyzeData(data);
    
    // Stocker les données en session
    if (!req.session) {
      req.session = {};
    }
    req.session.data = data;
    req.session.analysis = analysis;
    
    res.render('results', { data, analysis });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error processing file: ' + error.message);
  }
});

// Ajouter la route pour le tableau de bord
app.get('/dashboard', (req, res) => {
  // Si pas de données en session, rediriger vers l'accueil
  if (!req.session || !req.session.data || !req.session.analysis) {
    return res.redirect('/');
  }
  
  // Passer les fonctions helpers à la vue
  res.render('dashboard', {
    data: req.session.data,
    analysis: req.session.analysis,
    prepareChartsData,
    getCriticalAnomalies,
    getRecommendations,
    getRiskExplanation,
    getSequenceGapsExplanation
  });
});

// Ajouter cette route pour afficher les résultats
app.get('/results', (req, res) => {
  // Si pas de données en session, rediriger vers l'accueil
  if (!req.session || !req.session.data || !req.session.analysis) {
    return res.redirect('/');
  }
  
  // Afficher les résultats avec les données stockées en session
  res.render('results', { 
    data: req.session.data, 
    analysis: req.session.analysis 
  });
});

// Route pour l'analyse avancée
app.get('/analytics', (req, res) => {
  // Si pas de données en session, rediriger vers l'accueil
  if (!req.session || !req.session.data || !req.session.analysis) {
    return res.redirect('/');
  }
  
  res.render('analytics', {
    data: req.session.data,
    analysis: req.session.analysis,
    prepareAnalyticsData
  });
});

// Fonction pour préparer les données pour les graphiques
function prepareChartsData(data, analysis) {
  return {
    amountRanges: prepareAmountDistribution(data),
    accountActivity: prepareAccountActivity(data),
    benford: prepareBenfordData(analysis),
    timeline: prepareTimelineData(data),
    topAccounts: prepareTopAccounts(data)
  };
}

// Préparer la distribution des montants
function prepareAmountDistribution(data) {
  const ranges = [
    { max: 100, label: '0-100 €' },
    { max: 500, label: '101-500 €' },
    { max: 1000, label: '501-1000 €' },
    { max: 5000, label: '1001-5000 €' },
    { max: 10000, label: '5001-10000 €' },
    { max: 50000, label: '10001-50000 €' },
    { max: 100000, label: '50001-100000 €' },
    { max: Infinity, label: '> 100000 €' }
  ];
  
  const counts = Array(ranges.length).fill(0);
  
  data.forEach(entry => {
    const amount = Math.abs(parseFloat(entry.Debit || entry.debit || entry.Credit || entry.credit || 0));
    if (amount > 0) {
      for (let i = 0; i < ranges.length; i++) {
        if (amount <= ranges[i].max) {
          counts[i]++;
          break;
        }
      }
    }
  });
  
  return {
    labels: ranges.map(r => r.label),
    data: counts
  };
}

// Préparer l'activité par compte
function prepareAccountActivity(data) {
  const accountMap = {};
  
  data.forEach(entry => {
    const account = entry.CompteNum || entry.compte_num;
    if (!account) return;
    
    const mainCategory = String(account).substring(0, 1);
    
    if (!accountMap[mainCategory]) {
      accountMap[mainCategory] = 0;
    }
    
    accountMap[mainCategory]++;
  });
  
  const labels = [];
  const values = [];
  
  const accountLabels = {
    '1': 'Capitaux',
    '2': 'Immobilisations',
    '3': 'Stocks',
    '4': 'Tiers',
    '5': 'Financier',
    '6': 'Charges',
    '7': 'Produits',
    '8': 'Comptes spéciaux',
    '9': 'Analytique'
  };
  
  Object.entries(accountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([category, count]) => {
      const label = accountLabels[category] || `Catégorie ${category}`;
      labels.push(label);
      values.push(count);
    });
  
  return {
    labels,
    data: values
  };
}

// Préparer les données pour l'analyse de Benford
function prepareBenfordData(analysis) {
  const expectedFrequencies = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  
  let observedFrequencies = Array(9).fill(0);
  
  if (analysis.anomalies.benfordLawViolations && analysis.anomalies.benfordLawViolations.firstDigitDistribution) {
    observedFrequencies = analysis.anomalies.benfordLawViolations.firstDigitDistribution.slice(1, 10);
  }
  
  return {
    expected: expectedFrequencies,
    observed: observedFrequencies
  };
}

// Préparer les données temporelles
function prepareTimelineData(data) {
  const dateMap = {};
  
  data.forEach(entry => {
    const dateStr = entry.DatePiece || entry.date_piece || entry.date;
    if (!dateStr) return;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      
      const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!dateMap[formattedDate]) {
        dateMap[formattedDate] = 0;
      }
      
      dateMap[formattedDate]++;
    } catch (e) {
      // Ignorer les dates invalides
    }
  });
  
  const sortedDates = Object.keys(dateMap).sort();
  const counts = sortedDates.map(date => dateMap[date]);
  
  let labels = sortedDates;
  let values = counts;
  
  if (sortedDates.length > 30) {
    const monthMap = {};
    
    sortedDates.forEach((date, i) => {
      const month = date.substring(0, 7); // YYYY-MM
      if (!monthMap[month]) {
        monthMap[month] = 0;
      }
      monthMap[month] += counts[i];
    });
    
    labels = Object.keys(monthMap).sort();
    values = labels.map(month => monthMap[month]);
  }
  
  return {
    labels,
    data: values
  };
}

// Préparer les données des comptes les plus actifs
function prepareTopAccounts(data) {
  const accountsMap = {};
  
  data.forEach(entry => {
    const account = entry.CompteNum || entry.compte_num;
    if (!account) return;
    
    if (!accountsMap[account]) {
      accountsMap[account] = {
        account,
        transactions: 0,
        debit: 0,
        credit: 0
      };
    }
    
    const debit = parseFloat(entry.Debit || entry.debit || 0);
    const credit = parseFloat(entry.Credit || entry.credit || 0);
    
    accountsMap[account].transactions++;
    accountsMap[account].debit += isNaN(debit) ? 0 : debit;
    accountsMap[account].credit += isNaN(credit) ? 0 : credit;
  });
  
  return Object.values(accountsMap)
    .map(acc => ({
      account: acc.account,
      transactions: acc.transactions,
      amount: acc.debit + acc.credit
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

// Fonction pour extraire les anomalies critiques
function getCriticalAnomalies(analysis) {
  const criticalAnomalies = [];
  
  // Vérifier les écarts de balance
  if (Math.abs(analysis.summary.totalDebit - analysis.summary.totalCredit) > 0.01) {
    criticalAnomalies.push({
      type: 'Balance',
      detail: `Écart de ${Math.abs(analysis.summary.totalDebit - analysis.summary.totalCredit).toFixed(2)} €`,
      severity: 'high'
    });
  }
  
  // Vérifier les écritures non équilibrées
  if (analysis.anomalies.unbalancedEntries.length > 0) {
    criticalAnomalies.push({
      type: 'Équilibrage',
      detail: `${analysis.anomalies.unbalancedEntries.length} écritures non équilibrées`,
      severity: 'high'
    });
  }
  
  // Vérifier les séquences manquantes
  if (analysis.anomalies.sequenceGaps && analysis.anomalies.sequenceGaps.length > 0) {
    criticalAnomalies.push({
      type: 'Séquence',
      detail: `${analysis.anomalies.sequenceGaps.length} ruptures de séquence`,
      severity: 'medium'
    });
  }
  
  // Vérifier les anomalies Benford
  if (analysis.anomalies.benfordLawViolations && 
      analysis.anomalies.benfordLawViolations.significantDeviation) {
    criticalAnomalies.push({
      type: 'Benford',
      detail: `Écart significatif à la loi de Benford`,
      severity: 'medium'
    });
  }
  
  // Autres anomalies importantes
  if (analysis.anomalies.duplicateEntries.length > 5) {
    criticalAnomalies.push({
      type: 'Doublons',
      detail: `${analysis.anomalies.duplicateEntries.length} écritures potentiellement dupliquées`,
      severity: analysis.anomalies.duplicateEntries.length > 20 ? 'high' : 'medium'
    });
  }
  
  return criticalAnomalies;
}

// Générer des recommandations d'audit basées sur les résultats d'analyse
function getRecommendations(analysis) {
  const recommendations = [];
  
  // Vérifier les écarts dans la balance
  if (Math.abs(analysis.summary.totalDebit - analysis.summary.totalCredit) > 0.01) {
    recommendations.push({
      title: "Vérifier les écritures non équilibrées",
      description: `Un écart de ${Math.abs(analysis.summary.totalDebit - analysis.summary.totalCredit).toFixed(2)} € a été détecté dans la balance générale.`,
      details: [
        "Contrôler les écritures de clôture de période",
        "Vérifier les écritures d'ajustement récentes",
        "Réconcilier les comptes auxiliaires avec les comptes généraux"
      ]
    });
  }
  
  // Recommandations pour les doublons
  if (analysis.anomalies.duplicateEntries.length > 0) {
    recommendations.push({
      title: "Examiner les écritures potentiellement dupliquées",
      description: `${analysis.anomalies.duplicateEntries.length} écritures présentent des caractéristiques similaires et pourraient être des doublons.`,
      details: [
        "Vérifier si les doublons sont des erreurs de saisie ou des importations multiples",
        "Examiner le processus d'enregistrement des factures",
        "Contrôler les interfaces entre systèmes si applicable"
      ]
    });
  }
    // Recommandations pour les montants ronds
    if (analysis.anomalies.roundAmounts.length > 5) {
      recommendations.push({
        title: "Examiner les transactions avec montants ronds",
        description: `${analysis.anomalies.roundAmounts.length} transactions ont des montants ronds, potentiellement indicatifs d'estimations ou d'approximations.`,
        details: [
          "Demander les pièces justificatives pour les montants les plus significatifs",
          "Vérifier les bases de calcul utilisées pour ces montants",
          "S'assurer que ces montants correspondent à des transactions réelles"
        ]
      });
    }
    
    // Recommandations pour les transactions le week-end
    if (analysis.anomalies.weekendTransactions.length > 0) {
      recommendations.push({
        title: "Contrôler les transactions du weekend",
        description: `${analysis.anomalies.weekendTransactions.length} transactions ont été enregistrées pendant le weekend, période atypique d'activité comptable.`,
        details: [
          "Vérifier si ces transactions sont automatiques ou manuelles",
          "Identifier les utilisateurs ayant saisi ces écritures",
          "S'assurer que ces transactions sont justifiées par l'activité réelle de l'entité"
        ]
      });
    }
    
    // Recommandation pour les ruptures de séquence
    if (analysis.anomalies.sequenceGaps && analysis.anomalies.sequenceGaps.length > 0) {
      recommendations.push({
        title: "Vérifier les ruptures de séquence dans la numérotation",
        description: `${analysis.anomalies.sequenceGaps.length} ruptures de séquence ont été détectées dans la numérotation des pièces comptables.`,
        details: [
          "Vérifier si des pièces comptables ou écritures ont été supprimées",
          "Examiner les journaux concernés pour identifier des manipulations potentielles",
          "S'assurer que la séquentialité des numéros de pièces est respectée",
          "Vérifier les autorisations d'annulation d'écritures dans le système comptable"
        ]
      });
    }
    
    // Recommandation générale si peu d'anomalies
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Revue générale de la cohérence des données",
        description: "Aucune anomalie majeure n'a été détectée, mais une revue générale est recommandée.",
        details: [
          "Contrôle par sondage des écritures les plus significatives",
          "Vérification de la cohérence des soldes des comptes principaux",
          "Revue de la documentation associée aux transactions inhabituelles"
        ]
      });
    }
    
    return recommendations;
  }
  
  // Fonction pour générer l'explication du niveau de risque
  function getRiskExplanation(level, anomalyCount) {
    switch (level) {
      case 'high':
        return `Niveau de risque élevé : ${anomalyCount} anomalies ont été détectées. Un examen approfondi est fortement recommandé.`;
      case 'medium':
        return `Niveau de risque moyen : ${anomalyCount} anomalies ont été détectées. Un examen ciblé des anomalies est recommandé.`;
      case 'low':
        return `Niveau de risque faible : ${anomalyCount} anomalies ont été détectées. Une revue de routine devrait être suffisante.`;
      default:
        return `${anomalyCount} anomalies ont été détectées.`;
    }
  }
  
  // Fonction pour obtenir une explication des ruptures de séquence
  function getSequenceGapsExplanation(gaps) {
    if (!gaps || gaps.length === 0) {
      return "Aucune rupture de séquence détectée, ce qui suggère une bonne intégrité des données comptables.";
    }
    
    // Compter les journaux concernés
    const journals = new Set();
    gaps.forEach(gap => journals.add(gap.journal));
    
    // Calculer le nombre total d'écritures manquantes
    const missingTotal = gaps.reduce((sum, gap) => sum + gap.gap.missing, 0);
    
    // Trouver le journal le plus problématique
    const journalCounts = {};
    gaps.forEach(gap => {
      if (!journalCounts[gap.journal]) journalCounts[gap.journal] = 0;
      journalCounts[gap.journal] += gap.gap.missing;
    });
    
    let mostProblematicJournal = '';
    let maxMissing = 0;
    Object.entries(journalCounts).forEach(([journal, count]) => {
      if (count > maxMissing) {
        maxMissing = count;
        mostProblematicJournal = journal;
      }
    });
    
    return `${gaps.length} ruptures de séquence ont été détectées dans ${journals.size} journaux différents, avec un total de ${missingTotal} écritures potentiellement manquantes. Le journal "${mostProblematicJournal}" présente le plus grand nombre d'écritures manquantes (${maxMissing}). Ces ruptures peuvent indiquer des suppressions non autorisées ou des problèmes d'intégrité dans le système comptable.`;
  }

  // Préparation des données pour l'analyse avancée
  function prepareAnalyticsData(data, analysis) {
    return {
      timeSeries: prepareTimeSeriesData(data),
      monthlyDistribution: prepareMonthlyDistribution(data),
      dayOfWeek: prepareDayOfWeekDistribution(data),
      accounts: prepareAccountsAnalysis(data),
      journals: analyticsHelpers.prepareJournalsAnalysis(data),
      anomalies: analyticsHelpers.prepareAnomalyAnalysis(data, analysis)
    };
  }

function prepareTimeSeriesData(data) {
  // Group entries by date and calculate counts
  const entriesByDate = {};
  const amountsByDate = {};
  
  data.forEach(entry => {
    const dateStr = entry.DatePiece || entry.date_piece || entry.date;
    if (!dateStr) return;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      
      const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!entriesByDate[formattedDate]) {
        entriesByDate[formattedDate] = 0;
        amountsByDate[formattedDate] = 0;
      }
      
      entriesByDate[formattedDate]++;
      
      // Add amount (debit or credit)
      const amount = parseFloat(entry.Debit || entry.debit || entry.Credit || entry.credit || 0);
      amountsByDate[formattedDate] += isNaN(amount) ? 0 : amount;
    } catch (e) {
      // Ignore invalid dates
    }
  });
  
  // Sort dates and prepare chart data
  const sortedDates = Object.keys(entriesByDate).sort();
  
  return {
    labels: sortedDates,
    entries: sortedDates.map(date => entriesByDate[date]),
    amounts: sortedDates.map(date => amountsByDate[date])
  };
}

function prepareMonthlyDistribution(data) {
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const monthCounts = Array(12).fill(0);
  
  data.forEach(entry => {
    const dateStr = entry.DatePiece || entry.date_piece || entry.date;
    if (!dateStr) return;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      
      const month = date.getMonth();
      monthCounts[month]++;
    } catch (e) {
      // Ignore invalid dates
    }
  });
  
  return {
    labels: monthNames,
    data: monthCounts
  };
}

function prepareDayOfWeekDistribution(data) {
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const dayCounts = Array(7).fill(0);
  
  data.forEach(entry => {
    const dateStr = entry.DatePiece || entry.date_piece || entry.date;
    if (!dateStr) return;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      
      const day = date.getDay();
      dayCounts[day]++;
    } catch (e) {
      // Ignore invalid dates
    }
  });
  
  return {
    labels: dayNames,
    data: dayCounts
  };
}

function prepareAccountsAnalysis(data) {
  const accountsMap = {};
  
  data.forEach(entry => {
    const account = entry.CompteNum || entry.compte_num;
    if (!account) return;
    
    if (!accountsMap[account]) {
      accountsMap[account] = {
        account,
        transactions: 0,
        debit: 0,
        credit: 0,
        anomalies: 0
      };
    }
    
    const debit = parseFloat(entry.Debit || entry.debit || 0);
    const credit = parseFloat(entry.Credit || entry.credit || 0);
    
    accountsMap[account].transactions++;
    accountsMap[account].debit += isNaN(debit) ? 0 : debit;
    accountsMap[account].credit += isNaN(credit) ? 0 : credit;
    
    // Compter les anomalies potentielles
    if (debit === credit && debit > 0) accountsMap[account].anomalies++;
    if (Math.round(debit) === debit && debit > 1000) accountsMap[account].anomalies++;
    if (Math.round(credit) === credit && credit > 1000) accountsMap[account].anomalies++;
  });
  
  return Object.values(accountsMap)
    .filter(acc => acc.transactions > 5)
    .sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit))
    .slice(0, 20)
    .map(acc => ({
      account: acc.account,
      transactions: acc.transactions,
      amount: acc.debit + acc.credit,
      balance: acc.debit - acc.credit,
      anomalyRatio: acc.anomalies / acc.transactions
    }));
}

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Start the server
app.listen(port, () => {
  console.log(`FEC Analyzer running at http://localhost:${port}`);
});