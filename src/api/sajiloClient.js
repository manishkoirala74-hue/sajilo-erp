import { createClient } from '@supabase/supabase-js';
import { queryClientInstance } from '@/lib/query-client';

const supabaseUrl = import.meta.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = import.meta.env.VITE_SAJILO_APP_ID;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase URL or Key is missing. Check your .env.local file.");
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

let activeCompanyId = null;
const globalTables = ['User', 'Company', 'UserCompany'];

// ── Cross-Tab Synchronization ──
const syncChannel = new BroadcastChannel('sajilo_sync');

const invalidateReactQuery = (tableName) => {
  queryClientInstance.invalidateQueries({
    predicate: (query) => query.queryKey.includes(tableName)
  });
};

// Listen for invalidations from other tabs
syncChannel.onmessage = (event) => {
  if (event.data && event.data.type === 'INVALIDATE') {
    const { tableName } = event.data;
    invalidateReactQuery(tableName);
    window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: tableName }));
  }
};

const invalidateCache = (tableName) => {
  invalidateReactQuery(tableName);
  
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

  if (fyList.length === 0) {
    throw new Error('No Fiscal Year has been set up for this company. Please create a Fiscal Year in Settings first.');
  }

  if (!matchedFy) {
    throw new Error(`Transaction date ${targetDate.split('T')[0]} is outside all defined Fiscal Year bounds.`);
  }

  if (matchedFy.is_locked) {
    throw new Error(`Transaction date falls into a Locked Fiscal Year (${matchedFy.fiscal_year_name}).`);
  }
};

const handleSupabaseError = (error) => {
  if (error?.code === '23505') {
    throw new Error('This document number is already in use. Please generate or enter a new number.');
  }
  throw error;
};

const buildEntityMethods = (tableName) => {
  const isGlobal = globalTables.includes(tableName);
  
  const sanitizePayload = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizePayload);
    const cleaned = { ...obj };
    for (const key in cleaned) {
      if (cleaned[key] === '' && (key === 'id' || key.endsWith('_id'))) {
        cleaned[key] = null;
      } else if (typeof cleaned[key] === 'object' && cleaned[key] !== null) {
        cleaned[key] = sanitizePayload(cleaned[key]);
      }
    }
    return cleaned;
  };

  const applyCompanyFilter = (query) => {
    if (isGlobal) return query;
    const cid = sajilo.getCompanyId();
    if (cid) {
      return query.eq('company_id', cid);
    }
    // No company selected: return an impossible filter so the query yields 0 rows
    // instead of sending an unscoped query that bypasses tenant isolation.
    return query.eq('company_id', '00000000-0000-0000-0000-000000000000');
  };

  const injectCompanyId = (obj) => {
    if (isGlobal) return obj;
    if (typeof obj === 'object' && obj !== null) {
      // Respect explicit company_id if provided (e.g. background job or cross-tenant reversal)
      const finalCompanyId = obj.company_id || sajilo.getCompanyId();
      if (!finalCompanyId) {
        throw new Error(`[Sajilo Framework] Security Exception: Cannot perform action on '${tableName}' without an active company context. company_id is missing.`);
      }
      return { ...obj, company_id: finalCompanyId };
    }
    return obj;
  };

  return {
    list: async (orderBy = '', limit = 1000) => {
      // Short-circuit: non-global tables require a company context
      if (!isGlobal && !sajilo.getCompanyId()) return [];

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
      return data;
    },
    
    filter: async (matchObj, orderBy = '', limit = 1000) => {
      // Short-circuit: non-global tables require a company context
      if (!isGlobal && !sajilo.getCompanyId()) return [];

      const sanitizedMatch = sanitizePayload(matchObj);
      let query = supabase.from(tableName).select('*').match(sanitizedMatch).limit(limit);
      query = applyCompanyFilter(query);
      
      if (orderBy) {
        const desc = orderBy.startsWith('-');
        let field = desc ? orderBy.substring(1) : orderBy;
        if (field === 'created_date') field = 'created_at';
        query = query.order(field, { ascending: !desc });
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    
    get: async (id) => {
      const sanitizedMatch = sanitizePayload({ id });
      let query = supabase.from(tableName).select('*').eq('id', id).single();
      query = applyCompanyFilter(query);
      
      const { data, error } = await query;
      if (error && error.code !== 'PGRST116') throw error; // Ignore not found error
      return data;
    },
    
    create: async (obj) => {
      const sanitized = sanitizePayload(obj);
      await validateFiscalYear(tableName, sanitized);
      const objWithCompany = injectCompanyId(sanitized);
      const { data, error } = await supabase.from(tableName).insert(objWithCompany).select().single();
      if (error) handleSupabaseError(error);
      invalidateCache(tableName);
      return data;
    },
    
    update: async (id, obj) => {
      const sanitized = sanitizePayload(obj);
      await validateFiscalYear(tableName, sanitized);
      let query = supabase.from(tableName).update(sanitized).eq('id', id);
      query = applyCompanyFilter(query); // Ensure update is within company scope
      const { data, error } = await query.select().single();
      if (error) handleSupabaseError(error);
      invalidateCache(tableName);
      return data;
    },
    
    upsert: async (obj, options = {}) => {
      const sanitized = sanitizePayload(obj);
      await validateFiscalYear(tableName, sanitized);
      const objWithCompany = injectCompanyId(sanitized);
      
      const { onConflict } = options;
      
      let query = supabase.from(tableName).upsert(objWithCompany, {
        onConflict: onConflict || 'id',
        ignoreDuplicates: false
      });
      
      const { data, error } = await query.select().single();
      if (error) handleSupabaseError(error);
      invalidateCache(tableName);
      return data;
    },
    
    bulkCreate: async (arr) => {
      const sanitizedArr = sanitizePayload(arr);
      if (sanitizedArr.length > 0) await validateFiscalYear(tableName, sanitizedArr[0]); // Best effort for bulk
      const arrWithCompany = sanitizedArr.map(obj => injectCompanyId(obj));
      const { data, error } = await supabase.from(tableName).insert(arrWithCompany).select();
      if (error) handleSupabaseError(error);
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
  rpc: async (functionName, payload, invalidateTables = []) => {
    const { data, error } = await supabase.rpc(functionName, payload);
    if (error) throw error;
    
    // Natively handle cache clearing inside the wrapper
    invalidateTables.forEach(table => invalidateCache(table));
    return data;
  },
  invalidateCache,
  clearCache: () => {
    queryClientInstance.clear();
  },
  requestCompanyDeletion: async (companyId) => {
    const { data, error } = await supabase.rpc('request_company_deletion', { p_company_id: companyId });
    if (error) throw error;
    sajilo.clearCache();
    return data;
  },
  cancelCompanyDeletion: async (companyId) => {
    const { data, error } = await supabase.rpc('cancel_company_deletion', { p_company_id: companyId });
    if (error) throw error;
    sajilo.clearCache();
    return data;
  },
  prefetchDomainData: async (companyId) => {
    // Disabled: Aggressively pre-fetching massive tables (Items, Partners, Vouchers)
    // freezes the main browser thread during JSON parsing on company switch.
    // React Query will organically load what is needed for the active view.
  },
  setCompanyId: (id) => {
    if (activeCompanyId !== id) {
      activeCompanyId = id;
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
    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    loginWithPassword: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    loginWithGoogle: async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
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
  storage: {
    uploadFiles: async (bucket, files, pathPrefix = '') => {
      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${pathPrefix}${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;
        
        const { data: publicUrlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);
          
        return publicUrlData.publicUrl;
      });
      
      return Promise.all(uploadPromises);
    }
  },
  users: {
    createOfflineUser: async (email, full_name, role, company_id, temp_password, is_tenant_admin = false) => {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      
      const { data, error } = await supabase.functions.invoke('create-user-offline', {
        body: { email, full_name, role, company_id, temp_password, is_tenant_admin },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (error) {
          let errDetails = 'Failed to create offline user';
          if (error.context && typeof error.context.text === 'function') {
            try {
              const rawText = await error.context.text();
              try {
                const json = JSON.parse(rawText);
                errDetails = json.error || rawText;
              } catch (e) {
                errDetails = rawText;
              }
            } catch(e) {
              errDetails = error.message;
            }
          }
          throw new Error('Backend Error: ' + errDetails);
        }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
    },
    inviteUser: async (email, role, company_id, company_role_id = null) => {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email, role, company_id, company_role_id },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (error) {
        throw new Error(error.message || 'Failed to invite user');
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
    },
    resetUserPassword: async (target_user_id, temp_password, company_id) => {
      const session = await supabase.auth.getSession();
      const token = session?.data?.session?.access_token;
      
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { target_user_id, temp_password, company_id },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (error) {
        let errDetails = 'Failed to reset user password';
        if (error.context && typeof error.context.text === 'function') {
          try {
            const rawText = await error.context.text();
            try {
              const json = JSON.parse(rawText);
              errDetails = json.error || rawText;
            } catch (e) {
              errDetails = rawText;
            }
          } catch (e) {
            errDetails = error.message;
          }
        }
        throw new Error('Backend Error: ' + errDetails);
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
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
