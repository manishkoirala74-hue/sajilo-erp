import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = import.meta.env.VITE_SAJILO_APP_ID;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase URL or Key is missing. Check your .env.local file.");
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

let activeCompanyId = null;
const globalTables = ['User', 'Company', 'UserCompany'];

// ── In-Memory Cache for blazing fast navigation ──
const queryCache = new Map();

// ── Cross-Tab Synchronization ──
const syncChannel = new BroadcastChannel('sajilo_sync');

// Listen for invalidations from other tabs
syncChannel.onmessage = (event) => {
  if (event.data && event.data.type === 'INVALIDATE') {
    const { tableName } = event.data;
    internalInvalidate(tableName);
    window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: tableName }));
  }
};

const internalInvalidate = (tableName) => {
  for (const key of queryCache.keys()) {
    if (key.startsWith(tableName + ':')) {
      queryCache.delete(key);
    }
  }
};

const invalidateCache = (tableName) => {
  internalInvalidate(tableName);
  // Notify other tabs
  syncChannel.postMessage({ type: 'INVALIDATE', tableName });
  // Notify current tab (in case multiple components in the same tab need it)
  window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: tableName }));
};


const validateFiscalYear = async (tableName, payload) => {
  const targetTables = ['FinancialVoucher', 'POSSale', 'PurchaseInvoice', 'SalesInvoice'];
  if (!targetTables.includes(tableName)) return;

  let targetDate;
  if (tableName === 'FinancialVoucher') targetDate = payload.voucher_date;
  if (tableName === 'POSSale') targetDate = payload.sale_date;
  if (tableName === 'PurchaseInvoice') targetDate = payload.invoice_date;
  if (tableName === 'SalesInvoice') targetDate = payload.invoice_date;

  if (!targetDate) return;

  const dateObj = new Date(targetDate);
  // Reset times for accurate date comparison
  dateObj.setHours(0,0,0,0);
  
  const fyList = await sajilo.entities.FiscalYear.list();
  
  // Find a matching FY for the date
  const matchedFy = fyList.find(fy => {
    const sDate = new Date(fy.start_date);
    const eDate = new Date(fy.end_date);
    sDate.setHours(0,0,0,0);
    eDate.setHours(23,59,59,999);
    return dateObj >= sDate && dateObj <= eDate;
  });

  if (!matchedFy) {
    throw new Error(`Transaction date ${targetDate.split('T')[0]} is outside all defined Fiscal Year bounds.`);
  }

  if (matchedFy.is_locked) {
    throw new Error(`Transaction date falls into a Locked Fiscal Year (${matchedFy.fiscal_year_name}).`);
  }
};

const buildEntityMethods = (tableName) => {
  const isGlobal = globalTables.includes(tableName);
  
  const applyCompanyFilter = (query) => {
    if (isGlobal) return query;
    const cid = sajilo.getCompanyId();
    if (cid) {
      return query.eq('company_id', cid);
    }
    return query;
  };

  const injectCompanyId = (obj) => {
    if (isGlobal) return obj;
    const cid = sajilo.getCompanyId();
    if (cid && typeof obj === 'object') {
      return { ...obj, company_id: cid };
    }
    return obj;
  };

  return {
    list: async (orderBy = '', limit = 1000) => {
      const cacheKey = `${tableName}:list:${orderBy}:${limit}:${sajilo.getCompanyId()}`;
      if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);

      let query = supabase.from(tableName).select('*').limit(limit);
      query = applyCompanyFilter(query);
      
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        let field = desc ? orderBy.substring(1) : orderBy;
        if (field === 'created_date') field = 'created_at';
        query = query.order(field, { ascending: !desc });
      } else {
        query = query.order('created_at', { ascending: false });
      }
      
      const { data, error } = await query;
      if (error) throw error;
      queryCache.set(cacheKey, data);
      return data;
    },
    
    filter: async (matchObj, orderBy = '', limit = 1000) => {
      const cacheKey = `${tableName}:filter:${JSON.stringify(matchObj)}:${orderBy}:${limit}:${sajilo.getCompanyId()}`;
      if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);

      let query = supabase.from(tableName).select('*').match(matchObj).limit(limit);
      query = applyCompanyFilter(query);
      
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        let field = desc ? orderBy.substring(1) : orderBy;
        if (field === 'created_date') field = 'created_at';
        query = query.order(field, { ascending: !desc });
      }
      
      const { data, error } = await query;
      if (error) throw error;
      queryCache.set(cacheKey, data);
      return data;
    },
    
    create: async (obj) => {
      await validateFiscalYear(tableName, obj);
      const objWithCompany = injectCompanyId(obj);
      const { data, error } = await supabase.from(tableName).insert(objWithCompany).select().single();
      if (error) throw error;
      invalidateCache(tableName);
      return data;
    },
    
    update: async (id, obj) => {
      await validateFiscalYear(tableName, obj);
      let query = supabase.from(tableName).update(obj).eq('id', id);
      query = applyCompanyFilter(query); // Ensure update is within company scope
      const { data, error } = await query.select().single();
      if (error) throw error;
      invalidateCache(tableName);
      return data;
    },
    
    bulkCreate: async (arr) => {
      if (arr.length > 0) await validateFiscalYear(tableName, arr[0]); // Best effort for bulk
      const arrWithCompany = arr.map(obj => injectCompanyId(obj));
      const { data, error } = await supabase.from(tableName).insert(arrWithCompany).select();
      if (error) throw error;
      invalidateCache(tableName);
      return data;
    },
    
    delete: async (id) => {
       let query = supabase.from(tableName).delete().eq('id', id);
       query = applyCompanyFilter(query);
       const { data, error } = await query.select();
       if (error) throw error;
       invalidateCache(tableName);
       return data;
    }
  };
};
export const sajilo = {
  clearCache: () => {
    queryCache.clear();
  },
  wipeCompanyData: async (companyId) => {
    const { data, error } = await supabase.rpc('delete_company_data', { p_company_id: companyId });
    if (error) throw error;
    sajilo.clearCache();
    return data;
  },
  prefetchCompanyData: async () => {
    // Fire off exact queries used by dashboards so cache hits perfectly
    const promises = [
      sajilo.entities.ChartOfAccount.list('account_code'),
      sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Sub Ledger', is_active: true }, 'account_name', 300),
      sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Group Ledger', is_active: true }, 'account_code', 300),
      sajilo.entities.BusinessPartner.filter({ is_customer: true }, '-created_at'),
      sajilo.entities.BusinessPartner.filter({ is_vendor: true }, '-created_at'),
      sajilo.entities.Item.list('-created_at'),
      sajilo.entities.CompanySettings.list(),
      sajilo.entities.FinancialVoucher.list('-created_at', 500)
    ];
    await Promise.allSettled(promises);
  },
  setCompanyId: (id) => {
    if (activeCompanyId !== id) {
      activeCompanyId = id;
      queryCache.clear(); // Clear cache when company switches
    }
    if (id) {
      localStorage.setItem('activeCompanyId', id);
    } else {
      localStorage.removeItem('activeCompanyId');
    }
  },
  getCompanyId: () => {
    if (!activeCompanyId) {
      activeCompanyId = localStorage.getItem('activeCompanyId');
    }
    return activeCompanyId;
  },
  auth: {
    supabase,
    loginWithPassword: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    loginWithGoogle: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) throw error;
    },
    signUp: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },
    verifyOtp: async (email, token) => {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
      if (error) throw error;
      return data;
    },
    me: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw new Error("Not logged in");
      return user;
    },
    updateUser: async (attributes) => {
      const { data, error } = await supabase.auth.updateUser(attributes);
      if (error) throw error;
      return data;
    },
    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    redirectToLogin: () => {
      window.location.href = '/login';
    }
  },
  entities: new Proxy({}, {
    get: (target, prop) => {
      if (!target[prop]) {
        target[prop] = buildEntityMethods(prop);
      }
      return target[prop];
    }
  })
};
