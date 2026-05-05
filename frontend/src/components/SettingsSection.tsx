import React from 'react';

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

const SettingsSection: React.FC<SettingsSectionProps> = ({ title, description, children }) => {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/70">
      <div className="mb-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
};

export default SettingsSection;