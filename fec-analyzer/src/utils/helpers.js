export const formatDate = (dateString) => {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, options);
};

export const validateFileType = (file) => {
    const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
    return validTypes.includes(file.type);
};

export const calculateTotal = (data, key) => {
    return data.reduce((total, item) => total + (item[key] || 0), 0);
};

export const isEmptyObject = (obj) => {
    return Object.keys(obj).length === 0;
};