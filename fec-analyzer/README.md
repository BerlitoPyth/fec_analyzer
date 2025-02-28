# FEC Analyzer

## Overview
FEC Analyzer is a web application designed to upload, analyze, and detect anomalies in financial data files, specifically in .xlsx and .csv formats. This tool aims to assist auditors and accountants in identifying potential fraud and discrepancies in financial statements.

## Features
- Upload .xlsx or .csv files for analysis.
- Display parsed data in a user-friendly table format.
- Generate analysis reports highlighting potential anomalies.
- Easy-to-use interface for seamless interaction.

## Project Structure
```
fec-analyzer
├── src
│   ├── app.js                # Main entry point of the application
│   ├── components            # React components for the application
│   │   ├── FileUploader.js   # Component for file upload
│   │   ├── DataTable.js      # Component for displaying data in a table
│   │   └── AnalysisReport.js  # Component for showing analysis results
│   ├── services              # Services for file parsing and anomaly detection
│   │   ├── fileParser.js     # Functions for parsing files
│   │   └── anomalyDetector.js # Functions for detecting anomalies
│   └── utils                 # Utility functions
│       └── helpers.js        # Helper functions for various tasks
├── public
│   ├── index.html            # Main HTML file
│   └── styles.css            # Styles for the application
├── package.json              # npm configuration file
├── .gitignore                # Files and directories to ignore by Git
└── README.md                 # Documentation for the project
```

## Installation
1. Clone the repository:
   ```
   git clone https://github.com/yourusername/fec-analyzer.git
   ```
2. Navigate to the project directory:
   ```
   cd fec-analyzer
   ```
3. Install the dependencies:
   ```
   npm install
   ```

## Usage
1. Start the application:
   ```
   npm start
   ```
2. Open your web browser and go to `http://localhost:3000`.
3. Use the file uploader to select and upload your .xlsx or .csv file.
4. Review the displayed data and analysis report for any anomalies.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.