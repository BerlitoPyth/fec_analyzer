import React, { useState } from 'react';

const FileUploader = ({ onFileUpload }) => {
    const [file, setFile] = useState(null);

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.csv'))) {
            setFile(selectedFile);
            onFileUpload(selectedFile);
        } else {
            alert('Please upload a valid .xlsx or .csv file.');
        }
    };

    return (
        <div>
            <input 
                type="file" 
                accept=".xlsx, .csv" 
                onChange={handleFileChange} 
            />
            {file && <p>File selected: {file.name}</p>}
        </div>
    );
};

export default FileUploader;