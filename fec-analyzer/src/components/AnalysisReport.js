import React from 'react';

const AnalysisReport = ({ analysisResults, anomalies }) => {
    return (
        <div className="analysis-report">
            <h2>Analysis Report</h2>
            <h3>Analysis Results</h3>
            <pre>{JSON.stringify(analysisResults, null, 2)}</pre>
            <h3>Potential Anomalies Detected</h3>
            {anomalies.length > 0 ? (
                <ul>
                    {anomalies.map((anomaly, index) => (
                        <li key={index}>{anomaly}</li>
                    ))}
                </ul>
            ) : (
                <p>No anomalies detected.</p>
            )}
        </div>
    );
};

export default AnalysisReport;