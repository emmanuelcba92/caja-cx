import React, { useState } from 'react';

const MoneyInput = ({ value, onChange, placeholder = "0", readOnly = false, className = "" }) => {
  const handleChange = (e) => {
    const val = e.target.value.replace(/[^0-9.,]/g, '');
    onChange?.(val);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-slate-100 text-slate-500' : ''} ${className}`}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      readOnly={readOnly}
    />
  );
};

export default MoneyInput;
