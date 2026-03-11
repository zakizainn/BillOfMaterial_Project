'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Assy } from '@/lib/types';
import { Badge, Modal, Field, Input, Select, BtnPrimary, BtnGhost, ConfirmDialog, LoadingSpinner, StatCard, Table, Pagination } from '@/components/ui';

const font = "'DM Sans', system-ui, sans-serif";

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [['assy_code','assy_number','prod_qty','description','is_active'],['ASSY 20',20,500,'Contoh deskripsi','true']];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [20,14,12,30,12].map(w => ({ wch: w }));
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
      const missing = ['assy_code','assy_number','prod_qty','description','is_active'].filter(c => !Object.keys(rows[0]).includes(c));
      if (missing.length) { setErrors([`Kolom kurang: ${missing.join(', ')}`]); return; }
      const rowErrors: string[] = [];
      const cleaned = rows.map((row, i) => {
        if (!row.assy_code) rowErrors.push(`Baris ${i+2}: assy_code kosong`);
        if (!row.assy_number || isNaN(Number(row.assy_number))) rowErrors.push(`Baris ${i+2}: assy_number harus angka`);
        return { assy_code: String(row.assy_code).trim(), assy_number: Number(row.assy_number), prod_qty: row.prod_qty !== '' ? Number(row.prod_qty) : null, description: String(row.description || ''), is_active: String(row.is_active).toLowerCase() !== 'false' };
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
            <Table headers={[{label:'Assy Code'},{label:'No Urut'},{label:'Prod Qty'},{label:'Deskripsi'},{label:'Status'}]} rows={preview.map(r => [r.assy_code, r.assy_number, r.prod_qty ?? '—', r.description || '—', <Badge active={!!r.is_active} />])} />
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

function AssyForm({ initial, onSave, onClose, existingCodes }: {
  initial?: Assy; onSave: (f: Partial<Assy>) => void;
  onClose: () => void; existingCodes: string[];
}) {
  const editing = !!initial;
  const [form, setForm] = useState({
    assy_code:   initial?.assy_code   ?? '',
    assy_number: initial?.assy_number?.toString() ?? '',
    prod_qty:    initial?.prod_qty?.toString()    ?? '',
    description: initial?.description ?? '',
    is_active:   initial?.is_active   ?? true,
  });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const set = (k: string, v: unknown) => { setForm(f => ({...f,[k]:v})); setErrors(e => ({...e,[k]:''})); };

  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.assy_code.trim()) e.assy_code = 'Assy code wajib diisi';
    else if (!editing && existingCodes.includes(form.assy_code.trim())) e.assy_code = 'Assy code sudah ada';
    if (!form.assy_number || isNaN(Number(form.assy_number))) e.assy_number = 'Nomor urut wajib diisi (angka)';
    if (form.prod_qty !== '' && isNaN(Number(form.prod_qty))) e.prod_qty = 'Harus berupa angka';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...initial, assy_code: form.assy_code.trim(), assy_number: Number(form.assy_number), prod_qty: form.prod_qty === '' ? null : Number(form.prod_qty), description: form.description, is_active: form.is_active });
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Assy Code" required error={errors.assy_code}><Input value={form.assy_code} onChange={e => set('assy_code', e.target.value)} placeholder="e.g. ASSY 1" disabled={editing} /></Field>
        <Field label="Nomor Urut" required error={errors.assy_number}><Input type="number" value={form.assy_number} onChange={e => set('assy_number', e.target.value)} placeholder="1" /></Field>
      </div>
      <Field label="Production Qty" error={errors.prod_qty}><Input type="number" value={form.prod_qty} onChange={e => set('prod_qty', e.target.value)} placeholder="e.g. 399" /></Field>
      <Field label="Description"><Input value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Deskripsi (opsional)" /></Field>
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
  const canEdit   = role === 'PPC';     // tambah & edit
  const canDelete = role === 'FINANCE'; // hapus

  const [data, setData]             = useState<Assy[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState<null | 'add' | { editing: Assy }>(null);
  const [confirm, setConfirm]       = useState<number | null>(null);
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

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/assy/${id}`, { method: 'DELETE' });
      setData(d => d.filter(r => r.id !== id)); setConfirm(null); showToast('ASSY berhasil dihapus', 'success');
    } catch { showToast('Gagal menghapus ASSY', 'error'); }
  };

  // Bangun kolom aksi berdasarkan role
  const renderAksi = (r: Assy) => {
    if (canEdit && canDelete) {
      // tidak ada role yang punya keduanya, tapi jaga-jaga
      return <div style={{ display: 'flex', gap: 6 }}><BtnGhost onClick={() => setModal({ editing: r })} color="blue">Edit</BtnGhost><BtnGhost onClick={() => setConfirm(r.id)} color="red">Hapus</BtnGhost></div>;
    }
    if (canEdit) {
      return <div style={{ display: 'flex', gap: 6 }}><BtnGhost onClick={() => setModal({ editing: r })} color="blue">Edit</BtnGhost></div>;
    }
    if (canDelete) {
      return <div style={{ display: 'flex', gap: 6 }}><BtnGhost onClick={() => setConfirm(r.id)} color="red">Hapus</BtnGhost></div>;
    }
    return <span style={{ fontSize: 11.5, color: '#9ca3af', fontStyle: 'italic' }}>View only</span>;
  };

  const tableRows = paginated.map(r => [
    <span style={{ fontWeight: 600, color: '#1d4ed8', fontFamily: 'monospace', fontSize: 13 }}>{r.assy_code}</span>,
    <span style={{ color: '#4b5563' }}>{r.assy_number}</span>,
    <span style={{ fontWeight: 500 }}>{r.prod_qty != null ? Number(r.prod_qty).toLocaleString() : <span style={{ color: '#9ca3af' }}>—</span>}</span>,
    r.description ? <span style={{ color: '#4b5563' }}>{r.description}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Master ASSY</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Daftar Assembly — <b style={{ color: '#374151' }}>{data.length}</b> total ASSY</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Cari assy code / deskripsi..."
              style={{ padding: '9px 12px 9px 34px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 240, background: '#fff', color: '#111827' }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,.1)'; }}
              onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
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
        <StatCard label="Total ASSY"     value={data.length}                                                        color="#1d4ed8" />
        <StatCard label="Active"         value={data.filter(r => r.is_active).length}                              color="#16a34a" />
        <StatCard label="Total Prod Qty" value={data.reduce((s,r) => s+(Number(r.prod_qty)||0),0).toLocaleString()} color="#7c3aed" />
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner /> : (
        <>
          <Table headers={[{label:'Assy Code'},{label:'No Urut'},{label:'Prod Qty',right:true},{label:'Deskripsi'},{label:'Status'},{label:'Aksi'}]} rows={tableRows} />
          <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </>
      )}

      {canEdit && modal === 'add' && <Modal title="Tambah ASSY Baru" onClose={() => setModal(null)}><AssyForm onSave={handleAdd} onClose={() => setModal(null)} existingCodes={data.map(r => r.assy_code)} /></Modal>}
      {canEdit && modal && typeof modal === 'object' && 'editing' in modal && <Modal title={`Edit — ${modal.editing.assy_code}`} onClose={() => setModal(null)}><AssyForm initial={modal.editing} onSave={handleEdit} onClose={() => setModal(null)} existingCodes={data.map(r => r.assy_code)} /></Modal>}
      {canDelete && confirm !== null && <ConfirmDialog msg={`Yakin ingin menghapus ${data.find(r => r.id === confirm)?.assy_code}? Data yang dihapus tidak dapat dikembalikan.`} onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}
      {canEdit && showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={fetchData} showToast={showToast} />}
    </div>
  );
}
