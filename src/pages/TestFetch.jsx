// Create a test page
import React, { useEffect } from 'react';
import { fetchReportData } from '../lib/reportDataFetcher';

export default function TestFetch() {
  useEffect(() => {
    fetchReportData('profit_loss', '2020-01-01', '2030-01-01').then(res => {
      console.log('TEST FETCH RESULT', res);
    });
  }, []);
  return <div>Test Fetch</div>;
}
