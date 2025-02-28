/**
 * Analyze FEC data for potential anomalies and fraud indicators
 * @param {Array} data - Parsed FEC data
 * @returns {Object} - Analysis results
 */
function analyzeData(data) {
  const analysis = {
    summary: {
      totalEntries: data.length,
      dateRange: getDateRange(data),
      totalDebit: calculateTotalDebit(data),
      totalCredit: calculateTotalCredit(data)
    },
    anomalies: {
      duplicateEntries: findDuplicateEntries(data),
      unusualTransactionTimes: findUnusualTransactionTimes(data),
      roundAmounts: findRoundAmounts(data),
      unbalancedEntries: checkJournalBalance(data),
      sequenceGaps: findSequenceGaps(data),
      weekendTransactions: findWeekendTransactions(data),
      // Nouvelles méthodes de détection
      benfordLawViolations: checkBenfordLaw(data),
      endOfPeriodAdjustments: findEndOfPeriodAdjustments(data),
      unusualAccountActivity: detectUnusualAccountActivity(data),
      identicalAmounts: findIdenticalAmounts(data)
    },
    fraudIndicators: {
      frequentAdjustments: detectFrequentAdjustments(data),
      unusualJournalEntries: detectUnusualJournalEntries(data),
      // Nouveaux indicateurs de fraude
      transactionPatterns: detectSuspiciousPatterns(data),
      accountingGaps: findAccountingGaps(data),
      thresholdAvoidance: detectThresholdAvoidance(data)
    }
  };

  return analysis;
}

// Helper functions for analysis

function getDateRange(data) {
  // Extract and determine the date range of transactions
  // This assumes data has 'date' field in ISO format or similar
  let dates = data
    .map(entry => entry.DatePiece || entry.date_piece || entry.date)
    .filter(date => date)
    .map(date => new Date(date));
  
  if (dates.length === 0) return { start: null, end: null };
  
  const start = new Date(Math.min(...dates));
  const end = new Date(Math.max(...dates));
  
  return { start, end };
}

function calculateTotalDebit(data) {
  // Calculate total debits
  return data.reduce((sum, entry) => {
    const debitAmount = parseFloat(entry.Debit || entry.debit || entry.montant_debit || 0);
    return sum + (isNaN(debitAmount) ? 0 : debitAmount);
  }, 0);
}

function calculateTotalCredit(data) {
  // Calculate total credits
  return data.reduce((sum, entry) => {
    const creditAmount = parseFloat(entry.Credit || entry.credit || entry.montant_credit || 0);
    return sum + (isNaN(creditAmount) ? 0 : creditAmount);
  }, 0);
}

function findDuplicateEntries(data) {
  // Detect potential duplicate transactions with improved algorithm
  const entries = new Map();
  const duplicates = [];

  data.forEach((entry, index) => {
    // Create a more specific unique key based on relevant fields
    // Include all key accounting fields to reduce false positives
    const compteNum = entry.CompteNum || entry.compte_num || '';
    const datePiece = entry.DatePiece || entry.date_piece || '';
    const ecritureNum = entry.EcritureNum || entry.ecriture_num || '';
    const ecritureLib = entry.EcritureLib || entry.ecriture_lib || '';
    const debit = entry.Debit || entry.debit || '0';
    const credit = entry.Credit || entry.credit || '0';
    const pieceRef = entry.PieceRef || entry.piece_ref || '';
    
    // More specific key to reduce false positives
    const key = `${compteNum}-${datePiece}-${ecritureNum}-${pieceRef}-${debit}-${credit}`;
    
    // Skip key accounting identifiers - they're supposed to be unique per journal entry line
    if (ecritureNum) {
      if (entries.has(key)) {
        // Only flag as duplicate if it's an exact match of account, amount, date and reference
        // but different journal entry numbers
        const existingEntry = entries.get(key);
        const existingEcritureNum = existingEntry.entry.EcritureNum || existingEntry.entry.ecriture_num;
        
        if (existingEcritureNum !== ecritureNum) {
          duplicates.push({ index, entry });
        }
      } else {
        entries.set(key, { index, entry });
      }
    }
  });

  return duplicates;
}

function findUnusualTransactionTimes(data) {
  // Identify transactions recorded at unusual times
  return data.filter(entry => {
    const date = new Date(entry.DatePiece || entry.date_piece || entry.date);
    if (isNaN(date.getTime())) return false;
    
    const hour = date.getHours();
    // Unusual hours: late night (11pm-5am)
    return hour >= 23 || hour < 5;
  });
}

function findRoundAmounts(data) {
  // Find suspiciously round amounts
  return data.filter(entry => {
    const amount = parseFloat(entry.Debit || entry.debit || entry.Credit || entry.credit || 0);
    return amount % 1000 === 0 && amount !== 0;
  });
}

function checkJournalBalance(data) {
  // Check if journal entries are balanced (total debits = total credits)
  // Group by JournalCode and EcritureNum
  const journalEntries = {};
  
  data.forEach(entry => {
    const journalCode = entry.JournalCode || entry.journal_code;
    const entryNum = entry.EcritureNum || entry.ecriture_num;
    const key = `${journalCode}-${entryNum}`;
    
    if (!journalEntries[key]) {
      journalEntries[key] = { entries: [], debitTotal: 0, creditTotal: 0 };
    }
    
    const debit = parseFloat(entry.Debit || entry.debit || 0);
    const credit = parseFloat(entry.Credit || entry.credit || 0);
    
    journalEntries[key].entries.push(entry);
    journalEntries[key].debitTotal += isNaN(debit) ? 0 : debit;
    journalEntries[key].creditTotal += isNaN(credit) ? 0 : credit;
  });
  
  const unbalanced = Object.entries(journalEntries)
    .filter(([key, data]) => {
      return Math.abs(data.debitTotal - data.creditTotal) > 0.01; // Small tolerance for rounding errors
    })
    .map(([key, data]) => ({
      journalEntryId: key,
      diff: Math.abs(data.debitTotal - data.creditTotal),
      entries: data.entries
    }));
  
  return unbalanced;
}

function findSequenceGaps(data) {
  // Find gaps in transaction sequence numbers
  const sequences = {};
  
  data.forEach(entry => {
    const journalCode = entry.JournalCode || entry.journal_code;
    const entryNum = parseInt(entry.EcritureNum || entry.ecriture_num, 10);
    
    if (isNaN(entryNum)) return;
    
    if (!sequences[journalCode]) {
      sequences[journalCode] = [];
    }
    
    sequences[journalCode].push(entryNum);
  });
  
  const gaps = [];
  
  Object.entries(sequences).forEach(([journal, nums]) => {
    // Sort the sequence numbers
    nums.sort((a, b) => a - b);
    
    // Find gaps
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i-1] > 1) {
        gaps.push({
          journal,
          gap: { from: nums[i-1], to: nums[i], missing: nums[i] - nums[i-1] - 1 }
        });
      }
    }
  });
  
  return gaps;
}

function findWeekendTransactions(data) {
  // Identify transactions recorded on weekends
  return data.filter(entry => {
    const date = new Date(entry.DatePiece || entry.date_piece || entry.date);
    if (isNaN(date.getTime())) return false;
    
    const day = date.getDay();
    // 0 is Sunday, 6 is Saturday
    return day === 0 || day === 6;
  });
}

function detectFrequentAdjustments(data) {
  // Detect accounts with frequent adjustments
  const accountAdjustments = {};
  
  data.forEach(entry => {
    const accountNum = entry.CompteNum || entry.compte_num;
    const description = (entry.EcritureLib || entry.ecriture_lib || "").toLowerCase();
    
    if (!accountNum) return;
    
    if (!accountAdjustments[accountNum]) {
      accountAdjustments[accountNum] = 0;
    }
    
    // Check for adjustment keywords
    if (description.includes("ajustement") || 
        description.includes("correction") || 
        description.includes("régularisation") ||
        description.includes("regularisation") ||
        description.includes("ajust")) {
      accountAdjustments[accountNum]++;
    }
  });
  
  // Return accounts with frequent adjustments (more than 3)
  return Object.entries(accountAdjustments)
    .filter(([account, count]) => count > 3)
    .map(([account, count]) => ({ account, count }));
}

function detectUnusualJournalEntries(data) {
  // Detect unusual or suspicious journal entries
  return data.filter(entry => {
    const description = (entry.EcritureLib || entry.ecriture_lib || "").toLowerCase();
    const debit = parseFloat(entry.Debit || entry.debit || 0);
    const credit = parseFloat(entry.Credit || entry.credit || 0);
    
    // Check for suspicious descriptions
    const suspiciousTerms = [
      "divers", "other", "misc", "adjustment", "ajustement", 
      "special", "temporary", "pending", "error"
    ];
    
    const hasSuspiciousTerm = suspiciousTerms.some(term => description.includes(term));
    
    // Unusual large amount (customize threshold as needed)
    const isLargeAmount = (debit > 50000 || credit > 50000);
    
    return hasSuspiciousTerm && isLargeAmount;
  });
}

// Implémentation de la loi de Benford pour détecter les manipulations de nombres
function checkBenfordLaw(data) {
  // Les fréquences attendues selon la loi de Benford pour le premier chiffre (1-9)
  const benfordExpected = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  
  // Extraire tous les montants (débit ou crédit)
  const amounts = data.map(entry => {
    const amount = Math.abs(parseFloat(entry.Debit || entry.debit || entry.Credit || entry.credit || 0));
    return amount > 0 ? amount : null;
  }).filter(amount => amount !== null);
  
  // Comptage des premiers chiffres
  const firstDigitCounts = Array(10).fill(0);
  amounts.forEach(amount => {
    // Extraire le premier chiffre
    const firstDigit = parseInt(amount.toString().replace('.', '').charAt(0));
    if (!isNaN(firstDigit)) {
      firstDigitCounts[firstDigit]++;
    }
  });
  
  // Calculer les fréquences observées
  const totalCount = amounts.length;
  const observed = firstDigitCounts.map(count => count / totalCount);
  
  // Calculer les écarts par rapport à la loi de Benford
  const deviations = [];
  for (let digit = 1; digit <= 9; digit++) {
    const deviation = Math.abs(observed[digit] - benfordExpected[digit]);
    // Si l'écart est significatif (> 0.05)
    if (deviation > 0.05) {
      deviations.push({
        digit,
        expected: benfordExpected[digit],
        observed: observed[digit],
        deviation
      });
    }
  }
  
  return {
    deviations,
    firstDigitDistribution: observed,
    significantDeviation: deviations.length > 0
  };
}

// Détection des ajustements de fin de période
function findEndOfPeriodAdjustments(data) {
  const monthEndAdjustments = [];
  const quarterEndAdjustments = [];
  const yearEndAdjustments = [];
  
  data.forEach(entry => {
    const date = new Date(entry.DatePiece || entry.date_piece || entry.date);
    if (isNaN(date.getTime())) return;
    
    const description = (entry.EcritureLib || entry.ecriture_lib || "").toLowerCase();
    const isAdjustment = description.includes("ajustement") || 
                          description.includes("correction") || 
                          description.includes("régularisation") ||
                          description.includes("ajust");
                          
    const isEndOfMonth = date.getDate() >= 28;
    const month = date.getMonth() + 1;
    const isEndOfQuarter = isEndOfMonth && (month === 3 || month === 6 || month === 9 || month === 12);
    const isEndOfYear = isEndOfMonth && month === 12;
    
    if (isAdjustment) {
      if (isEndOfYear) {
        yearEndAdjustments.push(entry);
      } else if (isEndOfQuarter) {
        quarterEndAdjustments.push(entry);
      } else if (isEndOfMonth) {
        monthEndAdjustments.push(entry);
      }
    }
  });
  
  return {
    monthEnd: monthEndAdjustments,
    quarterEnd: quarterEndAdjustments,
    yearEnd: yearEndAdjustments
  };
}

// Détection d'activités inhabituelles sur les comptes
function detectUnusualAccountActivity(data) {
  const accountActivity = {};
  
  // Recueillir l'activité par compte
  data.forEach(entry => {
    const account = entry.CompteNum || entry.compte_num;
    if (!account) return;
    
    if (!accountActivity[account]) {
      accountActivity[account] = {
        transactions: 0,
        totalDebit: 0,
        totalCredit: 0,
        entries: []
      };
    }
    
    const debit = parseFloat(entry.Debit || entry.debit || 0);
    const credit = parseFloat(entry.Credit || entry.credit || 0);
    
    accountActivity[account].transactions++;
    accountActivity[account].totalDebit += isNaN(debit) ? 0 : debit;
    accountActivity[account].totalCredit += isNaN(credit) ? 0 : credit;
    accountActivity[account].entries.push(entry);
  });
  
  // Identifier les comptes avec activité inhabituelle
  const unusualAccounts = [];
  
  Object.entries(accountActivity).forEach(([account, activity]) => {
    // Comptes avec seulement quelques transactions mais montants importants
    if (activity.transactions < 5 && (activity.totalDebit > 100000 || activity.totalCredit > 100000)) {
      unusualAccounts.push({
        account,
        reason: "Volume faible mais montants élevés",
        transactions: activity.transactions,
        totalAmount: activity.totalDebit + activity.totalCredit
      });
    }
    
    // Comptes avec déséquilibre important
    const balance = activity.totalDebit - activity.totalCredit;
    if (Math.abs(balance) > 10000 && Math.abs(balance) / (activity.totalDebit + activity.totalCredit) > 0.1) {
      unusualAccounts.push({
        account,
        reason: "Déséquilibre significatif",
        balance,
        ratio: Math.abs(balance) / (activity.totalDebit + activity.totalCredit)
      });
    }
  });
  
  return unusualAccounts;
}

// Détection de montants identiques suspicieux
function findIdenticalAmounts(data) {
  // Recherche des montants répétés entre différents comptes
  const amountFrequency = {};
  
  data.forEach(entry => {
    const amount = parseFloat(entry.Debit || entry.debit || entry.Credit || entry.credit || 0);
    if (isNaN(amount) || amount === 0) return;
    
    const account = entry.CompteNum || entry.compte_num;
    const amountKey = amount.toFixed(2); // Clé standardisée
    
    if (!amountFrequency[amountKey]) {
      amountFrequency[amountKey] = {
        amount,
        occurrences: 0,
        accounts: new Set(),
        entries: []
      };
    }
    
    amountFrequency[amountKey].occurrences++;
    if (account) amountFrequency[amountKey].accounts.add(account);
    amountFrequency[amountKey].entries.push(entry);
  });
  
  // Filtrer pour trouver les montants identiques suspicieux
  const suspiciousAmounts = Object.values(amountFrequency)
    .filter(item => {
      // Montants qui apparaissent plusieurs fois dans différents comptes
      return item.occurrences >= 3 && item.accounts.size >= 2 && item.amount > 1000;
    })
    .map(item => ({
      amount: item.amount,
      occurrences: item.occurrences,
      uniqueAccounts: Array.from(item.accounts),
      entries: item.entries.slice(0, 10) // Limiter à 10 exemples
    }));
  
  return suspiciousAmounts;
}

// Détection de patterns de transaction suspects
function detectSuspiciousPatterns(data) {
  // On cherche des schémas comme: A -> B -> C -> A (circuits fermés)
  const transfers = [];
  const accountRelations = {};
  
  // Construire un graphe de relations entre comptes
  data.forEach(entry => {
    const description = (entry.EcritureLib || entry.ecriture_lib || "").toLowerCase();
    const account = entry.CompteNum || entry.compte_num;
    if (!account) return;
    
    // Identifier les virements entre comptes
    if (description.includes("virement") || description.includes("transfert")) {
      const debit = parseFloat(entry.Debit || entry.debit || 0);
      const credit = parseFloat(entry.Credit || entry.credit || 0);
      
      if (debit > 0 || credit > 0) {
        transfers.push(entry);
        
        // Essayer d'extraire le compte destinataire/source du libellé
        const otherAccountMatch = description.match(/\b\d{3,}(?:\.\d+)?\b/g);
        if (otherAccountMatch && otherAccountMatch.length > 0) {
          const otherAccount = otherAccountMatch.find(acc => acc !== account);
          
          if (otherAccount) {
            if (!accountRelations[account]) accountRelations[account] = new Set();
            accountRelations[account].add(otherAccount);
          }
        }
      }
    }
  });
  
  // Détecter les circuits fermés
  const circuits = [];
  Object.keys(accountRelations).forEach(startAccount => {
    findCircuits(startAccount, startAccount, [], accountRelations, circuits, new Set());
  });
  
  return {
    transfers: transfers.slice(0, 20),
    suspiciousCircuits: circuits.slice(0, 10)
  };
}

// Fonction auxiliaire pour trouver les circuits fermés dans un graphe
function findCircuits(startAccount, currentAccount, path, accountRelations, results, visited, depth = 0) {
  // Éviter les recherches trop profondes
  if (depth > 5) return;
  
  const currentPath = [...path, currentAccount];
  visited.add(currentAccount);
  
  const nextAccounts = accountRelations[currentAccount];
  if (nextAccounts) {
    nextAccounts.forEach(nextAccount => {
      // Circuit fermé trouvé
      if (nextAccount === startAccount && currentPath.length > 2) {
        results.push([...currentPath, startAccount]);
      } 
      // Continuer la recherche
      else if (!visited.has(nextAccount)) {
        findCircuits(startAccount, nextAccount, currentPath, accountRelations, results, new Set(visited), depth + 1);
      }
    });
  }
}

// Détection des gaps comptables (trous dans la séquence des comptes utilisés)
function findAccountingGaps(data) {
  const usedAccounts = new Set();
  
  // Collecter tous les numéros de compte et s'assurer qu'ils sont au format string
  data.forEach(entry => {
    const account = entry.CompteNum || entry.compte_num;
    if (account) usedAccounts.add(String(account)); // Conversion en string
  });
  
  // Regrouper les comptes par catégorie principale
  const accountCategories = {};
  Array.from(usedAccounts).forEach(account => {
    // Vérifier que account est bien une chaîne
    if (typeof account === 'string' && account.length > 0) {
      const mainCategory = account.substring(0, 1); // Premier chiffre du compte
      if (!accountCategories[mainCategory]) accountCategories[mainCategory] = [];
      accountCategories[mainCategory].push(account);
    }
  });
  
  // Vérifier les écarts dans chaque catégorie
  const gaps = [];
  Object.entries(accountCategories).forEach(([category, accounts]) => {
    // Trier les comptes numériquement
    const sortedAccounts = accounts.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0; // Valeur par défaut si NaN
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0; // Valeur par défaut si NaN
      return numA - numB;
    });
    
    // Chercher des intervalles inhabituels entre les comptes
    for (let i = 1; i < sortedAccounts.length; i++) {
      const prevAccount = parseInt(sortedAccounts[i-1].replace(/\D/g, ''), 10) || 0;
      const currAccount = parseInt(sortedAccounts[i].replace(/\D/g, ''), 10) || 0;
      
      // Si l'écart est important mais pas trop grand (pour éviter les faux positifs)
      if (prevAccount > 0 && currAccount > 0 && currAccount - prevAccount > 10 && currAccount - prevAccount < 100) {
        gaps.push({
          category,
          from: sortedAccounts[i-1],
          to: sortedAccounts[i],
          gap: currAccount - prevAccount - 1
        });
      }
    }
  });
  
  return gaps;
}

// Détection de l'évitement de seuils (montants juste en-dessous des seuils d'autorisation)
function detectThresholdAvoidance(data) {
  // Seuils courants en euros
  const thresholds = [5000, 10000, 15000, 20000, 25000, 30000, 50000, 100000];
  
  const nearThresholdTransactions = [];
  
  data.forEach(entry => {
    const amount = parseFloat(entry.Debit || entry.debit || entry.Credit || entry.credit || 0);
    if (isNaN(amount) || amount <= 0) return;
    
    // Vérifier si le montant est juste en dessous d'un seuil connu
    for (const threshold of thresholds) {
      // 2-5% en dessous du seuil
      if (amount >= threshold * 0.95 && amount < threshold) {
        nearThresholdTransactions.push({
          entry,
          amount,
          threshold,
          percentBelowThreshold: ((threshold - amount) / threshold) * 100
        });
        break; // Ne compter qu'une fois pour le seuil le plus proche
      }
    }
  });
  
  return nearThresholdTransactions;
}

module.exports = {
  analyzeData
};