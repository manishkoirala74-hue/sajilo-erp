import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Building, Settings, Check, X, GripVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// Using native WidthProvider HOC for rock-solid layout math in v1.4.4
import { Responsive as ResponsiveGrid, WidthProvider } from 'react-grid-layout';
const ResponsiveGridLayout = WidthProvider(ResponsiveGrid);

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

/* ── Layout persistence (localStorage, per user per company) ───────────── */
function lsKey(userId, companyId) {
  return `sajilo_layout_${userId}_${companyId}`;
}

function loadLayout(userId, companyId) {
  try {
    const raw = localStorage.getItem(lsKey(userId, companyId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.lg && Array.isArray(p.lg) && p.lg.length > 0) return p;
    if (Array.isArray(p) && p.length > 0) return { lg: p, md: p, sm: p };
  } catch (_) { /* ignore */ }
  return null;
}

function saveLayout(userId, companyId, layouts) {
  try {
    localStorage.setItem(lsKey(userId, companyId), JSON.stringify(layouts));
    return true;
  } catch (_) { return false; }
}

import { WidgetRegistry, defaultLayout } from './dashboard/WidgetRegistry';
const DEFAULT_LAYOUTS = { lg: defaultLayout, md: defaultLayout, sm: defaultLayout };

export default function Dashboard() {
  const { availableCompanies, isLoadingAuth, activeCompany, user } = useAuth();

  const [currentLayouts, setCurrentLayouts] = useState(DEFAULT_LAYOUTS);
  const pendingRef = useRef(DEFAULT_LAYOUTS);
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  const companyId = activeCompany?.id ?? null;
  const userId = user?.id ?? null;

  /* ── Load saved layout ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId || !companyId) return;
    const saved = loadLayout(userId, companyId);
    if (saved) {
      setCurrentLayouts(saved);
      pendingRef.current = saved;
    }
  }, [userId, companyId]);

  /* ── RGL callback: fires on every drag / resize ────────────────────── */
  const handleLayoutChange = useCallback((_layout, allLayouts) => {
    pendingRef.current = allLayouts;
  }, []);

  /* ── Save ──────────────────────────────────────────────────────────── */
  const handleSaveLayout = () => {
    if (!userId || !companyId) { setSaveStatus('error'); return; }
    setSaveStatus('saving');
    const ok = saveLayout(userId, companyId, pendingRef.current);
    if (ok) {
      setCurrentLayouts({ ...pendingRef.current });
      setSaveStatus('saved');
      setTimeout(() => { setSaveStatus(null); setIsEditing(false); }, 800);
    } else {
      setSaveStatus('error');
    }
  };

  const handleCancelEdit = () => {
    pendingRef.current = currentLayouts;
    setIsEditing(false);
    setSaveStatus(null);
  };

  /* ── Guards ─────────────────────────────────────────────────────────── */
  if (!isLoadingAuth && availableCompanies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[75vh] text-center space-y-5">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-2">
          <Building className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-bold text-foreground tracking-tight">Welcome to Sajilo ERP!</h2>
        <p className="text-muted-foreground max-w-lg text-lg">
          Before you can start managing your business, you need to set up your first company.
        </p>
        <Link to="/settings">
          <Button className="mt-4 shadow-lg hover:shadow-xl transition-shadow print:hidden" size="lg">
            Create Your First Company
          </Button>
        </Link>
      </div>
    );
  }

  const activeLayout = Array.isArray(currentLayouts.lg) ? currentLayouts.lg : defaultLayout;

  return (
    <div className="space-y-4 p-1">
      {/* ── Header Area ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Dashboard Workspace</h2>
          {isEditing && (
            <p className="text-xs text-stone-500 mt-0.5">
              Grab the purple <span className="font-bold text-indigo-600">⠿</span> handle to move cards · Drag corners to scale layout
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              {saveStatus === 'error' && (
                <span className="text-xs text-destructive mr-1">Could not save. Try again.</span>
              )}
              <Button variant="outline" size="sm" className="rounded-xl h-9 text-xs print:hidden" onClick={handleCancelEdit} disabled={saveStatus === 'saving'}>
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs print:hidden" onClick={handleSaveLayout} disabled={saveStatus === 'saving'}>
                {saveStatus === 'saving' ? 'Saving Blueprint…' : 'Save Blueprint'}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="rounded-xl h-9 border-stone-200 text-stone-700 text-xs print:hidden" onClick={() => { setSaveStatus(null); setIsEditing(true); }}>
              <Settings className="w-4 h-4 mr-1.5" /> Customize Layout
            </Button>
          )}
        </div>
      </div>

      {/* ── Grid Container ── */}
      <div style={{ overflowX: 'hidden' }}>
        <ResponsiveGridLayout
          // 🟢 CRITICAL KEY INJECTION: Forces a clean remount when editing mode shifts, 
          // successfully rebinding fresh window pointer event listeners.
          key={`dashboard-grid-session-${isEditing}`}
          className="layout"
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 4, md: 3, sm: 2, xs: 1, xxs: 1 }}
          rowHeight={160}
          layouts={currentLayouts}
          onLayoutChange={handleLayoutChange}
          margin={[16, 16]}
          
          // Native Layout Engine Properties
          isDraggable={isEditing}
          isResizable={isEditing}
          draggableHandle=".global-dashboard-drag-handle"
          resizeHandles={['se', 's', 'e']}
        >
          {activeLayout.map((item) => {
            const WidgetComponent = WidgetRegistry[item.i];
            if (!WidgetComponent) return null;

            return (
              /* Flat Single-Tier DOM Structure */
              <div
                key={item.i}
                className={`
                  bg-[#faf9f5] dark:bg-card rounded-2xl border border-stone-200/60 p-6
                  flex flex-col justify-between overflow-hidden relative group box-border
                  ${isEditing ? 'ring-2 ring-dashed ring-emerald-600/30 bg-stone-50/10 shadow-inner' : 'shadow-sm'}
                `}
              >
                {/* Drag Handle Button Trigger Element */}
                {isEditing && (
                  <button
                    type="button"
                    className="global-dashboard-drag-handle print:hidden"
                    title="Drag to reposition card"
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(79, 70, 229, 0.9)',
                      borderRadius: 6,
                      cursor: 'grab',
                      zIndex: 500,
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-white pointer-events-none" />
                  </button>
                )}

                {/* Sub-Widget Content Viewport */}
                <div className="flex-1 w-full h-full overflow-hidden z-10">
                  <WidgetComponent date_range={item.date_range} isEditing={isEditing} />
                </div>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      </div>
    </div>
  );
}