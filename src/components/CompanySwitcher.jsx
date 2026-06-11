import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export const CompanySwitcher = () => {
  const { activeCompany, availableCompanies, switchCompany, user, isSwitchingCompany } = useAuth();

  if (!user || availableCompanies.length <= 1) {
    return null; // Don't show switcher if not logged in or only 1 company available
  }

  return (
    <>
      <div className="flex items-center space-x-2 px-2 py-1">
        <span className="text-sm font-medium text-gray-500">Company:</span>
        <Select
          value={activeCompany?.id || ''}
          onValueChange={(value) => switchCompany(value)}
          disabled={isSwitchingCompany}
        >
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue placeholder="Select a company" />
          </SelectTrigger>
          <SelectContent>
            {availableCompanies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isSwitchingCompany && (
        <div className="fixed inset-0 z-[9999] bg-card/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
          <h2 className="text-lg font-semibold text-foreground">Switching Workspace...</h2>
          <p className="text-sm text-gray-500 mt-1">Loading company data into memory for faster access.</p>
        </div>
      )}
    </>
  );
};
