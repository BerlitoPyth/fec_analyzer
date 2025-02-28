const xlsx = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');

/**
 * Parse the uploaded FEC file (xlsx or csv)
 * @param {string} filePath - Path to the uploaded file
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<Array>} - Parsed data from the file
 */
async function parseFile(filePath, mimeType) {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return parseXlsx(filePath);
  } else if (mimeType === 'text/csv') {
    return parseCsv(filePath);
  } else {
    throw new Error('Unsupported file type');
  }
}

/**
 * Parse XLSX file
 * @param {string} filePath 
 * @returns {Array} - Parsed data
 */
function parseXlsx(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(worksheet);
}

/**
 * Parse CSV file
 * @param {string} filePath 
 * @returns {Promise<Array>} - Parsed data
 */
function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

module.exports = {
  parseFile
};