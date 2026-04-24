'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Assy } from '@/lib/types';
import { Badge, Modal, Field, Input, Select, BtnPrimary, BtnGhost, ConfirmDialog, LoadingSpinner, StatCard, Table, Pagination } from '@/components/ui';

const font = "'DM Sans', system-ui, sans-serif";

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [
    ['assy_code','assy_number','sequence','carline','destinasi','komoditi','description','is_active'],
    ['82219-K0050 B 1101', 1, 1, 'CY-S', 'YC', 'WH', 'Contoh deskripsi', 'true']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [30,12,12,15,15,15,30,12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Master ASSY');
  XLSX.writeFile(wb, 'template_master_assy.xlsx');
}

function UploadModal({ onClose, onSuccess, showToast }: {
  onClose: () => void; onSuccess: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Partial<Assy>[] | null>(null);
  const [errors, setErrors]   = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setErrors([]); setPreview(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      if (!rows.length) { setErrors(['File kosong.']); return; }
      const missing = ['assy_code','assy_number','is_active'].filter(c => !Object.keys(rows[0]).includes(c));
      if (missing.length) { setErrors([`Kolom kurang: ${missing.join(', ')}`]); return; }
      const rowErrors: string[] = [];
      const cleaned = rows.map((row, i) => {
        if (!row.assy_code) rowErrors.push(`Baris ${i+2}: assy_code kosong`);
        if (!row.assy_number || isNaN(Number(row.assy_number))) rowErrors.push(`Baris ${i+2}: assy_number harus angka`);
        return {
          assy_code:   String(row.assy_code).trim(),
          assy_number: Number(row.assy_number),
          sequence:    row.sequence !== '' && row.sequence != null ? Number(row.sequence) : null,
          carline:     String(row.carline   || '').trim() || null,
          destinasi:   String(row.destinasi || '').trim() || null,
          komoditi:    String(row.komoditi  || '').trim() || null,
          description: String(row.description || '').trim(),
          is_active:   String(row.is_active).toLowerCase() !== 'false',
        };
      });
      if (rowErrors.length) { setErrors(rowErrors); return; }
      setPreview(cleaned);
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (!preview) return;
    setLoading(true);
    let ok = 0, fail = 0;
    for (const row of preview) {
      try { const res = await fetch('/api/assy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) }); if (res.ok) ok++; else fail++; }
      catch { fail++; }
    }
    setLoading(false);
    showToast(fail === 0 ? `${ok} data berhasil diupload!` : `${ok} berhasil, ${fail} gagal (mungkin duplikat)`, fail === 0 ? 'success' : 'error');
    onSuccess(); onClose();
  };

  return (
    <Modal title="Upload Excel — Master ASSY" onClose={onClose} wide>
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📥</span>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: '#0369a1', fontFamily: font }}>Step 1 — Download Template</span>
        </div>
        <p style={{ fontSize: 12.5, color: '#0c4a6e', marginBottom: 12, fontFamily: font }}>Download template Excel, isi data sesuai format, lalu upload.</p>
        <BtnGhost onClick={downloadTemplate} color="teal">⬇ Download Template Master ASSY</BtnGhost>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>📤</span>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: '#111827', fontFamily: font }}>Step 2 — Pilih File Excel</span>
        </div>
        <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${fileName ? '#86efac' : '#cbd5e1'}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: fileName ? '#f0fdf4' : '#f8fafc', transition: 'all .15s' }}
          onMouseOver={e => { if (!fileName) { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#eff6ff'; }}}
          onMouseOut={e =>  { if (!fileName) { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: fileName ? '#16a34a' : '#6b7280', fontFamily: font, marginBottom: 4 }}>{fileName ? `✓ ${fileName}` : 'Klik untuk pilih file .xlsx'}</p>
          <p style={{ fontSize: 12, color: '#9ca3af', fontFamily: font }}>Format: .xlsx — Maks 1000 baris</p>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
      </div>
      {errors.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontWeight: 700, color: '#dc2626', fontSize: 12, marginBottom: 6, fontFamily: font }}>⚠ Ditemukan Error:</p>
          {errors.map((e, i) => <p key={i} style={{ fontSize: 12, color: '#dc2626', fontFamily: font }}>• {e}</p>)}
        </div>
      )}
      {preview && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 600, fontSize: 13.5, color: '#111827', marginBottom: 10, fontFamily: font }}>👁 Preview Data ({preview.length} baris)</p>
          <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <Table headers={[{label:'Assy Code'},{label:'Seq'},{label:'Komoditi'},{label:'Destinasi'},{label:'Carline'},{label:'Deskripsi'},{label:'Status'}]} rows={preview.map(r => [r.assy_code, (r as any).sequence ?? '—', (r as any).komoditi || '—', (r as any).destinasi || '—', (r as any).carline || '—', r.description || '—', <Badge active={!!r.is_active} />])} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
        <BtnGhost onClick={onClose} color="gray">Batal</BtnGhost>
        <BtnPrimary onClick={handleUpload} disabled={!preview || loading}>{loading ? 'Mengupload...' : `Upload ${preview ? preview.length + ' Data' : ''}`}</BtnPrimary>
      </div>
    </Modal>
  );
}

function AssyForm({ initial, onSave, onClose, existingEntries }: {
  initial?: Assy; onSave: (f: Partial<Assy>) => void;
  onClose: () => void; existingEntries: { assy_code: string; sequence: number | null }[];
}) {
  const editing = !!initial;
  const [form, setForm] = useState({
    assy_code:   initial?.assy_code   ?? '',
    assy_number: initial?.assy_number?.toString() ?? '',
    sequence:    initial?.sequence?.toString()    ?? '',
    carline:     initial?.carline    ?? '',
    destinasi:   initial?.destinasi  ?? '',
    komoditi:    initial?.komoditi   ?? '',
    description: initial?.description ?? '',
    is_active:   initial?.is_active   ?? true,
  });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const set = (k: string, v: unknown) => { setForm(f => ({...f,[k]:v})); setErrors(e => ({...e,[k]:''})); };

  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.assy_code.trim()) e.assy_code = 'Assy code wajib diisi';
    else if (!editing) {
      // Cek duplikat berdasarkan assy_code + sequence
      const isDuplicate = existingEntries.some(
        entry => entry.assy_code === form.assy_code.trim() &&
        String(entry.sequence ?? '') === String(form.sequence ?? '')
      );
      if (isDuplicate) e.assy_code = 'Kombinasi Assy Code dan Sequence sudah ada';
    }
    if (!form.assy_number || isNaN(Number(form.assy_number))) e.assy_number = 'Nomor urut wajib diisi (angka)';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({
      ...initial,
      assy_code:   form.assy_code.trim(),
      assy_number: Number(form.assy_number),
      sequence:    form.sequence !== '' ? Number(form.sequence) : null,
      carline:     form.carline.trim()   || null,
      destinasi:   form.destinasi.trim() || null,
      komoditi:    form.komoditi.trim()  || null,
      description: form.description,
      is_active:   form.is_active,
    });
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Assy Code" required error={errors.assy_code}><Input value={form.assy_code} onChange={e => set('assy_code', e.target.value)} placeholder="e.g. 82219-K0050 B 1101" disabled={editing} /></Field>
        <Field label="Nomor Urut" required error={errors.assy_number}><Input type="number" value={form.assy_number} onChange={e => set('assy_number', e.target.value)} placeholder="1" /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
        <Field label="Carline"><Input value={form.carline} onChange={e => set('carline', e.target.value)} placeholder="e.g. CY-S" /></Field>
        <Field label="Destinasi"><Input value={form.destinasi} onChange={e => set('destinasi', e.target.value)} placeholder="e.g. YC" /></Field>
        <Field label="Komoditi"><Input value={form.komoditi} onChange={e => set('komoditi', e.target.value)} placeholder="e.g. WH" /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 16px' }}>
        <Field label="Sequence"><Input type="number" value={form.sequence} onChange={e => set('sequence', e.target.value)} placeholder="1" /></Field>
        <Field label="Description"><Input value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Deskripsi (opsional)" /></Field>
      </div>
      <Field label="Status"><Select value={form.is_active ? 'active' : 'inactive'} onChange={e => set('is_active', e.target.value === 'active')} options={['active','inactive']} /></Field>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
        <BtnGhost onClick={onClose} color="gray">Batal</BtnGhost>
        <BtnPrimary onClick={handleSave}>{editing ? 'Simpan Perubahan' : 'Tambah ASSY'}</BtnPrimary>
      </div>
    </>
  );
}

export default function MasterAssyPage({ showToast, role }: {
  showToast: (msg: string, type: 'success' | 'error') => void;
  role: string;
}) {
  const canEdit         = role === 'PPC';     // tambah & edit
  const canDelete       = role === 'FINANCE'; // hapus
  const canToggleStatus = role === 'PPC';     // toggle status bulk

  const [data, setData]             = useState<Assy[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState<null | 'add' | { editing: Assy }>(null);
  const [selected, setSelected]           = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk]     = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [perPage, setPerPage]       = useState(10);

  const fetchData = () => {
    setLoading(true);
    fetch('/api/assy').then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => { showToast('Gagal memuat data ASSY', 'error'); setLoading(false); });
  };
  useEffect(() => { fetchData(); }, []);

  const filtered  = data.filter(r => (r.assy_code ?? '').toLowerCase().includes(search.toLowerCase()) || (r.description ?? '').toLowerCase().includes(search.toLowerCase()));
  const paginated = filtered.slice((page-1)*perPage, page*perPage);

  const handleAdd = async (form: Partial<Assy>) => {
    try {
      const res = await fetch('/api/assy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const created = await res.json();
      setData(d => [...d, created]); setModal(null); showToast('ASSY berhasil ditambahkan', 'success');
    } catch { showToast('Gagal menambah ASSY', 'error'); }
  };

  const handleEdit = async (form: Partial<Assy>) => {
    try {
      const res = await fetch(`/api/assy/${form.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const updated = await res.json();
      setData(d => d.map(r => r.id === updated.id ? updated : r)); setModal(null); showToast('ASSY berhasil diperbarui', 'success');
    } catch { showToast('Gagal memperbarui ASSY', 'error'); }
  };



  const handleDeleteBulk = async () => {
    try {
      await Promise.all([...selected].map(id => fetch(`/api/assy/${id}`, { method: 'DELETE' })));
      setData(d => d.filter(r => !selected.has(r.id)));
      showToast(`${selected.size} ASSY berhasil dihapus`, 'success');
      setSelected(new Set()); setConfirmBulk(false);
    } catch { showToast('Gagal menghapus data', 'error'); }
  };

  const handleToggleStatus = async () => {
    setTogglingStatus(true);
    try {
      const res  = await fetch('/api/assy/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error, 'error'); return; }
      // Update local state
      setData(d => d.map(r => {
        if (selected.has(r.id)) return { ...r, is_active: !r.is_active };
        return r;
      }));
      showToast(data.message, 'success');
      setSelected(new Set()); setConfirmToggle(false);
    } catch { showToast('Gagal mengubah status', 'error'); }
    setTogglingStatus(false);
  };

  const toggleSelect  = (id: number) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll     = () => setSelected(s => s.size === paginated.length ? new Set() : new Set(paginated.map(r => r.id)));
  const allChecked    = paginated.length > 0 && paginated.every(r => selected.has(r.id));

  // Bangun kolom aksi berdasarkan role
  const renderAksi = (r: Assy) => {

    if (canEdit) {
      return <div style={{ display: 'flex', gap: 6 }}><BtnGhost onClick={() => setModal({ editing: r })} color="blue">Edit</BtnGhost></div>;
    }
    if (canDelete) {
      return <span style={{ fontSize: 11.5, color: '#9ca3af', fontStyle: 'italic' }}>Gunakan bulk select</span>;
    }
    return <span style={{ fontSize: 11.5, color: '#9ca3af', fontStyle: 'italic' }}>View only</span>;
  };

  const showCheckbox = canDelete || canToggleStatus;
  const tableRows = paginated.map(r => [
    ...(showCheckbox ? [<input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: canDelete ? '#dc2626' : '#16a34a' }} />] : []),
    <span style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'monospace', fontSize: 12.5 }}>{r.assy_code}</span>,
    r.sequence != null ? <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 5, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>{r.sequence}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
    r.komoditi  ? <span style={{ color: '#374151', fontSize: 13 }}>{r.komoditi}</span>  : <span style={{ color: '#d1d5db' }}>—</span>,
    r.destinasi ? <span style={{ color: '#374151', fontSize: 13 }}>{r.destinasi}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
    r.carline   ? <span style={{ color: '#374151', fontSize: 13 }}>{r.carline}</span>   : <span style={{ color: '#d1d5db' }}>—</span>,
    r.description ? <span style={{ color: '#4b5563', fontSize: 13 }}>{r.description}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
    <Badge active={r.is_active} />,
    renderAksi(r),
  ]);

  // Role badge info
  const roleBanner = () => {
    if (canEdit)   return { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✏️', text: `Role <b>PPC</b> — dapat menambah dan mengedit data ASSY. Penghapusan hanya bisa dilakukan oleh Finance.` };
    if (canDelete) return { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '🗑', text: `Role <b>FINANCE</b> — memiliki akses hapus data. Penambahan dan pengeditan hanya bisa dilakukan oleh PPC.` };
    return { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: '👁', text: `Role <b>${role}</b> — hanya dapat melihat data ini.` };
  };
  const banner = roleBanner();

  return (
    <div style={{ fontFamily: font }}>
      {/* Role banner */}
      <div style={{ background: banner.bg, border: `1px solid ${banner.border}`, borderRadius: 10, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: banner.color }}
        dangerouslySetInnerHTML={{ __html: `${banner.icon} ${banner.text}` }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>Master ASSY</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Daftar Assembly — <b style={{ color: '#0f172a' }}>{data.length.toLocaleString()}</b> total &nbsp;·&nbsp;
            <b style={{ color: '#16a34a' }}>{data.filter(r => r.is_active).length.toLocaleString()}</b> aktif
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Cari assy code / deskripsi..."
              style={{ padding: '9px 12px 9px 34px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 260, background: '#fff', color: '#0f172a', boxShadow: '0 1px 2px rgba(0,0,0,.04)', transition: 'border-color .15s, box-shadow .15s' }}
              onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,.1)'; }}
              onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,.04)'; }} />
          </div>
          {canEdit && (
            <>
              <BtnGhost onClick={() => setShowUpload(true)} color="teal">📤 Upload Excel</BtnGhost>
              <BtnPrimary onClick={() => setModal('add')}>+ Tambah ASSY</BtnPrimary>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total ASSY" value={data.length} color="#1d4ed8" />
        <StatCard label="Active" value={data.filter(r => r.is_active).length} color="#16a34a" />
      </div>

      {/* Table */}
      {/* Bulk action bar */}
      {canToggleStatus && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, marginBottom: 12, boxShadow: '0 2px 8px rgba(22,163,74,.08)', animation: 'fadeIn .2s ease' }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🔄</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d', flex: 1 }}>{selected.size} ASSY dipilih</span>
          <button onClick={() => setConfirmToggle(true)} disabled={togglingStatus} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: font, boxShadow: '0 2px 6px rgba(22,163,74,.25)', transition: 'opacity .15s' }}
            onMouseOver={e => e.currentTarget.style.opacity = '.88'}
            onMouseOut={e  => e.currentTarget.style.opacity = '1'}
          >🔄 Toggle Status</button>
          <button onClick={() => setSelected(new Set())} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #bbf7d0', background: '#fff', color: '#16a34a', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: font, transition: 'background .15s' }}
            onMouseOver={e => e.currentTarget.style.background = '#f0fdf4'}
            onMouseOut={e  => e.currentTarget.style.background = '#fff'}
          >Batal</button>
        </div>
      )}

      {canDelete && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, marginBottom: 12, boxShadow: '0 2px 8px rgba(220,38,38,.08)', animation: 'fadeIn .2s ease' }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🗑</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', flex: 1 }}>{selected.size} ASSY dipilih</span>
          <button onClick={() => setConfirmBulk(true)} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: font, boxShadow: '0 2px 6px rgba(220,38,38,.25)', transition: 'opacity .15s' }}
            onMouseOver={e => e.currentTarget.style.opacity = '.88'}
            onMouseOut={e  => e.currentTarget.style.opacity = '1'}
          >Hapus yang Dipilih</button>
          <button onClick={() => setSelected(new Set())} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: font, transition: 'background .15s' }}
            onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
            onMouseOut={e  => e.currentTarget.style.background = '#fff'}
          >Batal</button>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <>
          <Table headers={[
              ...(showCheckbox ? [{label: <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: canDelete ? '#dc2626' : '#16a34a' }} /> as unknown as string}] : []),
              {label:'Assy Code'},{label:'Seq'},{label:'Komoditi'},{label:'Destinasi'},{label:'Carline'},{label:'Deskripsi'},{label:'Status'},{label:'Aksi'}
            ]} rows={tableRows} />
          <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </>
      )}

      {canEdit && modal === 'add' && <Modal title="Tambah ASSY Baru" onClose={() => setModal(null)}><AssyForm onSave={handleAdd} onClose={() => setModal(null)} existingEntries={data.map(r => ({ assy_code: r.assy_code, sequence: r.sequence ?? null }))} /></Modal>}
      {canEdit && modal && typeof modal === 'object' && 'editing' in modal && <Modal title={`Edit — ${modal.editing.assy_code}`} onClose={() => setModal(null)}><AssyForm initial={modal.editing} onSave={handleEdit} onClose={() => setModal(null)} existingEntries={data.map(r => ({ assy_code: r.assy_code, sequence: r.sequence ?? null }))} /></Modal>}
      {canToggleStatus && confirmToggle && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 28px 22px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.18)', fontFamily: font }}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔄</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 6 }}>Toggle Status ASSY</div>
                <p style={{ color: '#64748b', fontSize: 13.5, lineHeight: 1.6 }}>
                  Yakin ingin mengubah status <b>{selected.size} ASSY</b> sekaligus?<br />
                  Yang aktif akan dinonaktifkan, yang nonaktif akan diaktifkan.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmToggle(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: font }}>Batal</button>
              <button onClick={handleToggleStatus} disabled={togglingStatus} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: font, boxShadow: '0 2px 8px rgba(22,163,74,.25)' }}>
                {togglingStatus ? '⏳ Mengubah...' : '🔄 Ya, Toggle Status'}
              </button>
            </div>
          </div>
        </div>
      )}
      {canDelete && confirmBulk && <ConfirmDialog msg={`Yakin ingin menghapus ${selected.size} ASSY sekaligus? Data tidak dapat dikembalikan.`} onConfirm={handleDeleteBulk} onCancel={() => setConfirmBulk(false)} />}

      {canEdit && showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={fetchData} showToast={showToast} />}
    </div>
  );
}
