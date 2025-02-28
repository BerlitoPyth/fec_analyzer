/**
 * Fonctions auxiliaires pour les analyses avancées
 */

/**
 * Prépare l'analyse des journaux comptables
 * @param {Array} data - Données du fichier FEC
 * @returns {Object} Données d'analyse des journaux
 */
function prepareJournalsAnalysis(data) {
  const journalsMap = {};
  
  // Collecter les informations par journal
  data.forEach(entry => {
    const journal = entry.JournalCode || entry.journal_code;
    if (!journal) return;
    
    if (!journalsMap[journal]) {
      journalsMap[journal] = {
        journal,
        name: entry.JournalLib || entry.journal_lib || journal,
        entries: 0,
        debit: 0,
        credit: 0,
        weekendCount: 0,
        eveningCount: 0,
        accounts: new Set(),
        anomalyCount: 0
      };
    }
    
    // Comptabiliser les entrées et montants
    journalsMap[journal].entries++;
    
    const debit = parseFloat(entry.Debit || entry.debit || 0);
    const credit = parseFloat(entry.Credit || entry.credit || 0);
    journalsMap[journal].debit += isNaN(debit) ? 0 : debit;
    journalsMap[journal].credit += isNaN(credit) ? 0 : credit;
    
    // Compter les transactions du weekend ou en soirée
    const dateStr = entry.DatePiece || entry.date_piece || entry.date;
    if (dateStr) {
      try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const day = date.getDay();
          if (day === 0 || day === 6) {
            journalsMap[journal].weekendCount++;
          }
          
          // Si l'heure est disponible
          if (entry.EcritureTime || entry.ecriture_time) {
            const timeStr = entry.EcritureTime || entry.ecriture_time;
            const hour = parseInt(timeStr.split(':')[0], 10);
            if (!isNaN(hour) && (hour < 8 || hour >= 19)) {
              journalsMap[journal].eveningCount++;
            }
          }
        }
      } catch (e) {
        // Ignorer les erreurs de date
      }
    }
    
    // Collecter les comptes utilisés
    const account = entry.CompteNum || entry.compte_num;
    if (account) {
      journalsMap[journal].accounts.add(account);
    }
    
    // Détecter des anomalies potentielles
    const pieceRef = entry.PieceRef || entry.piece_ref;
    const ecritureLib = (entry.EcritureLib || entry.ecriture_lib || "").toLowerCase();
    
    // Vérifier les libellés suspects
    if (ecritureLib.includes("divers") || ecritureLib.includes("ajust") || 
        ecritureLib.includes("régul") || ecritureLib.includes("correct")) {
      journalsMap[journal].anomalyCount++;
    }
    
    // Vérifier les montants ronds importants
    if ((Math.round(debit) === debit && debit > 1000) || 
        (Math.round(credit) === credit && credit > 1000)) {
      journalsMap[journal].anomalyCount++;
    }
  });
  
  // Convertir en tableau et calculer les métriques supplémentaires
  return Object.values(journalsMap)
    .map(journal => ({
      ...journal,
      accountCount: journal.accounts.size,
      accounts: Array.from(journal.accounts).slice(0, 5), // Top 5 comptes pour l'affichage
      balance: parseFloat((journal.debit - journal.credit).toFixed(2)),
      anomalyRate: journal.entries > 0 ? 
        parseFloat((journal.anomalyCount / journal.entries).toFixed(4)) : 0,
      weekendRate: journal.entries > 0 ? 
        parseFloat((journal.weekendCount / journal.entries).toFixed(4)) : 0
    }))
    .sort((a, b) => b.entries - a.entries);
}

/**
 * Prépare l'analyse détaillée des anomalies
 * @param {Array} data - Données du fichier FEC
 * @param {Object} analysis - Résultats de l'analyse initiale
 * @returns {Object} Données d'analyse des anomalies
 */
function prepareAnomalyAnalysis(data, analysis) {
  // Catégoriser les anomalies
  const categories = {
    balance: {
      label: "Équilibrage",
      count: analysis.anomalies.unbalancedEntries ? analysis.anomalies.unbalancedEntries.length : 0,
      severity: "high",
      details: analysis.anomalies.unbalancedEntries || []
    },
    duplicates: {
      label: "Doublons",
      count: analysis.anomalies.duplicateEntries ? analysis.anomalies.duplicateEntries.length : 0,
      severity: "high",
      details: analysis.anomalies.duplicateEntries || []
    },
    roundAmounts: {
      label: "Montants ronds",
      count: analysis.anomalies.roundAmounts ? analysis.anomalies.roundAmounts.length : 0,
      severity: "medium",
      details: analysis.anomalies.roundAmounts || []
    },
    weekendTransactions: {
      label: "Transactions weekend",
      count: analysis.anomalies.weekendTransactions ? analysis.anomalies.weekendTransactions.length : 0,
      severity: "low",
      details: analysis.anomalies.weekendTransactions || []
    },
    sequenceGaps: {
      label: "Ruptures de séquence",
      count: analysis.anomalies.sequenceGaps ? analysis.anomalies.sequenceGaps.length : 0,
      severity: "medium",
      details: analysis.anomalies.sequenceGaps || []
    },
    unusualTiming: {
      label: "Horaires inhabituels",
      count: analysis.anomalies.unusualTransactionTimes ? analysis.anomalies.unusualTransactionTimes.length : 0,
      severity: "low",
      details: analysis.anomalies.unusualTransactionTimes || []
    }
  };
  
  // Préparer les données pour le graphique radar des anomalies
  const radarData = {
    labels: Object.values(categories).map(c => c.label),
    data: Object.values(categories).map(c => c.count),
    severities: Object.values(categories).map(c => c.severity)
  };
  
  // Anomalies par journal
  const journalAnomalies = getAnomaliesByJournal(data, analysis);
  
  // Anomalies par période
  const timelineAnomalies = getAnomaliesByPeriod(data, analysis);
  
  // Détecter les schémas inhabituels dans les montants
  const amountPatterns = detectAmountPatterns(data);
  
  return {
    categories,
    radarData,
    journalAnomalies,
    timelineAnomalies,
    amountPatterns,
    totalCount: Object.values(categories).reduce((sum, category) => sum + category.count, 0),
    riskScore: calculateRiskScore(categories)
  };
}

/**
 * Calcule le score de risque global en fonction des anomalies
 * @param {Object} categories - Catégories d'anomalies avec leur sévérité
 * @returns {Number} Score de risque entre 0 et 100
 */
function calculateRiskScore(categories) {
  const weights = {
    high: 10,
    medium: 5,
    low: 2
  };
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  Object.values(categories).forEach(category => {
    const weight = weights[category.severity] || 1;
    weightedSum += Math.min(category.count * weight, 100); // Plafonner l'impact de chaque catégorie
    totalWeight += weight;
  });
  
  // Score normalisé entre 0 et 100
  const rawScore = totalWeight > 0 ? weightedSum / (totalWeight * 10) : 0;
  return Math.min(Math.round(rawScore * 100), 100);
}

/**
 * Répartit les anomalies par journal comptable
 * @param {Array} data - Données du fichier FEC
 * @param {Object} analysis - Résultats de l'analyse
 * @returns {Array} Anomalies par journal
 */
function getAnomaliesByJournal(data, analysis) {
  const journalAnomalies = {};
  
  // Initialiser les compteurs pour chaque journal
  data.forEach(entry => {
    const journal = entry.JournalCode || entry.journal_code;
    if (!journal) return;
    
    if (!journalAnomalies[journal]) {
      journalAnomalies[journal] = {
        journal,
        name: entry.JournalLib || entry.journal_lib || journal,
        duplicates: 0,
        unbalanced: 0,
        roundAmounts: 0,
        weekendTransactions: 0,
        sequenceGaps: 0,
        unusualTiming: 0,
        total: 0
      };
    }
  });
  
  // Compter les anomalies par journal
  // Doublons
  if (analysis.anomalies.duplicateEntries) {
    analysis.anomalies.duplicateEntries.forEach(item => {
      // Vérifier que l'entrée et le journal existent
      if (!item || !item.entry) return;
      
      const entry = item.entry;
      const journal = entry.JournalCode || entry.journal_code;
      if (journal && journalAnomalies[journal]) {
        journalAnomalies[journal].duplicates++;
        journalAnomalies[journal].total++;
      }
    });
  }
  
  // Non équilibrées
  if (analysis.anomalies.unbalancedEntries) {
    analysis.anomalies.unbalancedEntries.forEach(item => {
      // Vérifier que l'item et le journal existent
      if (!item || !item.journal) return;
      
      const journal = item.journal;
      if (journal && journalAnomalies[journal]) {
        journalAnomalies[journal].unbalanced++;
        journalAnomalies[journal].total++;
      }
    });
  }
  
  // Montants ronds
  if (analysis.anomalies.roundAmounts) {
    analysis.anomalies.roundAmounts.forEach(item => {
      // Vérifier que l'entrée existe
      if (!item || !item.entry) return;
      
      const entry = item.entry;
      const journal = entry.JournalCode || entry.journal_code;
      if (journal && journalAnomalies[journal]) {
        journalAnomalies[journal].roundAmounts++;
        journalAnomalies[journal].total++;
      }
    });
  }
  
  // Transactions weekend
  if (analysis.anomalies.weekendTransactions) {
    analysis.anomalies.weekendTransactions.forEach(item => {
      // Vérifier que l'entrée existe
      if (!item || !item.entry) return;
      
      const entry = item.entry;
      const journal = entry.JournalCode || entry.journal_code;
      if (journal && journalAnomalies[journal]) {
        journalAnomalies[journal].weekendTransactions++;
        journalAnomalies[journal].total++;
      }
    });
  }
  
  // Ruptures de séquence
  if (analysis.anomalies.sequenceGaps) {
    analysis.anomalies.sequenceGaps.forEach(item => {
      // Vérifier que l'item et le journal existent
      if (!item || !item.journal) return;
      
      const journal = item.journal;
      if (journal && journalAnomalies[journal]) {
        journalAnomalies[journal].sequenceGaps++;
        journalAnomalies[journal].total++;
      }
    });
  }
  
  // Horaires inhabituels
  if (analysis.anomalies.unusualTransactionTimes) {
    analysis.anomalies.unusualTransactionTimes.forEach(item => {
      // Vérifier que l'entrée existe
      if (!item || !item.entry) return;
      
      const entry = item.entry;
      const journal = entry.JournalCode || entry.journal_code;
      if (journal && journalAnomalies[journal]) {
        journalAnomalies[journal].unusualTiming++;
        journalAnomalies[journal].total++;
      }
    });
  }
  
  // Convertir en tableau et trier par nombre total d'anomalies
  return Object.values(journalAnomalies)
    .filter(j => j.total > 0)
    .sort((a, b) => b.total - a.total);
}

/**
 * Répartit les anomalies par période (mois)
 * @param {Array} data - Données du fichier FEC
 * @param {Object} analysis - Résultats de l'analyse
 * @returns {Object} Anomalies par période
 */
function getAnomaliesByPeriod(data, analysis) {
  const months = {};
  
  // Fonction pour ajouter une anomalie à un mois
  const addToMonth = (dateStr, type) => {
    if (!dateStr) return;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!months[yearMonth]) {
        months[yearMonth] = {
          period: yearMonth,
          duplicates: 0,
          unbalanced: 0,
          roundAmounts: 0,
          weekendTransactions: 0,
          unusualTiming: 0,
          total: 0
        };
      }
      
      months[yearMonth][type]++;
      months[yearMonth].total++;
    } catch (e) {
      // Ignorer les erreurs de date
    }
  };
  
  // Compter les anomalies par mois
  // Doublons
  if (analysis.anomalies.duplicateEntries) {
    analysis.anomalies.duplicateEntries.forEach(item => {
      // Vérifier que l'item et l'entrée existent
      if (!item || !item.entry) return;
      
      const dateStr = item.entry.DatePiece || item.entry.date_piece || item.entry.date;
      addToMonth(dateStr, 'duplicates');
    });
  }
  
  // Montants ronds
  if (analysis.anomalies.roundAmounts) {
    analysis.anomalies.roundAmounts.forEach(item => {
      // Vérifier que l'item et l'entrée existent
      if (!item || !item.entry) return;
      
      const dateStr = item.entry.DatePiece || item.entry.date_piece || item.entry.date;
      addToMonth(dateStr, 'roundAmounts');
    });
  }
  
  // Transactions weekend
  if (analysis.anomalies.weekendTransactions) {
    analysis.anomalies.weekendTransactions.forEach(item => {
      // Vérifier que l'item et l'entrée existent
      if (!item || !item.entry) return;
      
      const dateStr = item.entry.DatePiece || item.entry.date_piece || item.entry.date;
      addToMonth(dateStr, 'weekendTransactions');
    });
  }
  
  // Horaires inhabituels
  if (analysis.anomalies.unusualTransactionTimes) {
    analysis.anomalies.unusualTransactionTimes.forEach(item => {
      // Vérifier que l'item et l'entrée existent
      if (!item || !item.entry) return;
      
      const dateStr = item.entry.DatePiece || item.entry.date_piece || item.entry.date;
      addToMonth(dateStr, 'unusualTiming');
    });
  }
  
  // Pour les écritures non équilibrées, la date n'est pas directement accessible
  // On pourrait récupérer les écritures d'origine à partir de leur ID, mais pour simplifier:
  if (analysis.anomalies.unbalancedEntries) {
    // On va juste compter globalement
    const unbalancedCount = analysis.anomalies.unbalancedEntries.length;
    // Et répartir proportionnellement sur les mois trouvés
    if (unbalancedCount > 0 && Object.keys(months).length > 0) {
      const perMonth = Math.ceil(unbalancedCount / Object.keys(months).length);
      Object.keys(months).forEach(month => {
        months[month].unbalanced += perMonth;
        months[month].total += perMonth;
      });
    }
  }
  
  // Convertir en tableau et trier par période
  const periodData = Object.values(months).sort((a, b) => a.period.localeCompare(b.period));
  
  // Préparer les données pour graphique
  return {
    periods: periodData.map(p => p.period),
    duplicates: periodData.map(p => p.duplicates),
    unbalanced: periodData.map(p => p.unbalanced),
    roundAmounts: periodData.map(p => p.roundAmounts),
    weekendTransactions: periodData.map(p => p.weekendTransactions),
    unusualTiming: periodData.map(p => p.unusualTiming),
    total: periodData.map(p => p.total),
    details: periodData
  };
}

/**
 * Détecte des motifs suspects dans les montants
 * @param {Array} data - Données du fichier FEC
 * @returns {Object} Motifs détectés
 */
function detectAmountPatterns(data) {
  // Compter la fréquence des montants
  const amountFrequency = {};
  const digitPatterns = {};
  
  data.forEach(entry => {
    // Analyse des montants
    const debit = parseFloat(entry.Debit || entry.debit || 0);
    const credit = parseFloat(entry.Credit || entry.credit || 0);
    
    [debit, credit].forEach(amount => {
      if (amount <= 0) return;
      
      // Arrondir à deux décimales pour regrouper les montants similaires
      const roundedAmount = Math.round(amount * 100) / 100;
      const key = roundedAmount.toFixed(2);
      
      if (!amountFrequency[key]) {
        amountFrequency[key] = { 
          amount: roundedAmount,
          count: 0,
          entries: []
        };
      }
      
      amountFrequency[key].count++;
      // Limiter le nombre d'exemples pour éviter une surcharge mémoire
      if (amountFrequency[key].entries.length < 5) {
        amountFrequency[key].entries.push(entry);
      }
      
      // Analyser les schémas de chiffres
      const amountStr = roundedAmount.toString();
      
      // Détecter les motifs suspects
      // 1. Séquences de chiffres répétés (ex: 1111.00)
      const repeatedDigits = /(\d)\1{2,}/g;
      const repeatedMatches = amountStr.match(repeatedDigits);
      if (repeatedMatches) {
        repeatedMatches.forEach(match => {
          const pattern = `${match.length} fois ${match[0]}`;
          if (!digitPatterns[pattern]) {
            digitPatterns[pattern] = { pattern, count: 0, examples: [] };
          }
          digitPatterns[pattern].count++;
          if (digitPatterns[pattern].examples.length < 3) {
            digitPatterns[pattern].examples.push(roundedAmount);
          }
        });
      }
      
      // 2. Motifs symétriques (ex: 1221.00)
      const digits = amountStr.replace('.', '').split('');
      let isSymmetric = true;
      for (let i = 0; i < Math.floor(digits.length / 2); i++) {
        if (digits[i] !== digits[digits.length - 1 - i]) {
          isSymmetric = false;
          break;
        }
      }
      
      if (isSymmetric && digits.length >= 4) {
        const pattern = "Symétrique";
        if (!digitPatterns[pattern]) {
          digitPatterns[pattern] = { pattern, count: 0, examples: [] };
        }
        digitPatterns[pattern].count++;
        if (digitPatterns[pattern].examples.length < 3) {
          digitPatterns[pattern].examples.push(roundedAmount);
        }
      }
    });
  });
  
  // Trouver les montants les plus fréquents (hors 0)
  const frequentAmounts = Object.values(amountFrequency)
    .filter(item => item.count >= 3 && item.amount > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  // Convertir patterns en tableau
  const patterns = Object.values(digitPatterns)
    .filter(pattern => pattern.count >= 3)
    .sort((a, b) => b.count - a.count);
  
  return {
    frequentAmounts,
    patterns
  };
}

// Exporter les fonctions pour utilisation dans app.js
module.exports = {
  prepareJournalsAnalysis,
  prepareAnomalyAnalysis
};