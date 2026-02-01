import React, { useState, useEffect } from 'react';

const MoneyInput = ({ value, onChange, className, placeholder, currency = '$' }) => {
    // Format helper: 1234.56 -> "1.234,56"
    const format = (val) => {
        if (val === '' || val === null || val === undefined) return '';
        return new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(val);
    };

    // Parse helper: "1.234,56" -> 1234.56
    const parse = (val) => {
        if (!val) return 0;
        // Remove dots (thousands), replace comma with dot (decimal)
        const clean = val.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
        return parseFloat(clean);
    };

    const [displayValue, setDisplayValue] = useState('');

    useEffect(() => {
        if (value !== undefined && value !== null) {
            // Only update display if it's not currently being edited focused? 
            // Actually, we usually format on blur.
            // But simple approach: format the incoming prop value
            setDisplayValue(format(value));
        }
    }, [value]);

    const handleChange = (e) => {
        const val = e.target.value;
        // Allow typing numbers, commas, dots
        setDisplayValue(val);
    };

    const handleBlur = () => {
        const num = parse(displayValue);
        if (!isNaN(num)) {
            onChange(num);
            setDisplayValue(format(num)); // Re-format cleanly
        } else {
            onChange(0);
            setDisplayValue(format(0));
        }
    };

    const handleFocus = (e) => {
        e.target.select();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    };

    return (
        <input
            type="text"
            className={className}
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
        />
    );
};

export default MoneyInput;
