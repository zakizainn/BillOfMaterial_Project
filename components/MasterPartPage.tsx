'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Part, UNIT_OPTIONS } from '@/lib/types';
import { Badge, Modal, Field, Input, Select, BtnPrimary, BtnGhost, ConfirmDialog, LoadingSpinner, StatCard, Table, Pagination } from '@/components/ui';

const font = "'DM Sans', system-ui, sans-serif";

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const data = [['part_no','part_no_as400','part_name','unit','supplier_code','supplier_name','is_active'],['P-020','AS4-1020','Contoh Part Name','PCS','PT A','Nama Supplier','true']];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [12,16,30,8,14,25,12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Master Part');
  XLSX.writeFile(wb, 'template_master_part.xlsx');
}

function UploadModal({ onClose, onSuccess, showToast }: {
  onClose: () => void; onSuccess: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Partial<Part>[] | null>(null);
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
      const missing = ['part_no','part_no_as400','part_name','unit'].filter(c => !Object.keys(rows[0]).includes(c));
      if (missing.length) { setErrors([`Kolom kurang: ${missing.join(', ')}`]); return; }
      const rowErrors: string[] = [];
      const cleaned = rows.map((row, i) => {
        if (!row.part_no)       rowErrors.push(`Baris ${i+2}: part_no kosong`);
        if (!row.part_no_as400) rowErrors.push(`Baris ${i+2}: part_no_as400 kosong`);
        if (!row.part_name)     rowErrors.push(`Baris ${i+2}: part_name kosong`);
        if (!row.unit)          rowErrors.push(`Baris ${i+2}: unit kosong`);
        return { part_no: String(row.part_no).trim(), part_no_as400: String(row.part_no_as400).trim(), part_name: String(row.part_name).trim(), unit: String(row.unit).trim(), supplier_code: String(row.supplier_code || ''), supplier_name: String(row.supplier_name || ''), is_active: String(row.is_active).toLowerCase() !== 'false' };
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
      try { const res = await fetch('/api/part', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) }); if (res.ok) ok++; else fail++; }
      catch { fail++; }
    }
    setLoading(false);
    showToast(fail === 0 ? `${ok} data berhasil diupload!` : `${ok} berhasil, ${fail} gagal`, fail === 0 ? 'success' : 'error');
    onSuccess(); onClose();
  };

  return (
    <Modal title="Upload Excel — Master Part" onClose={onClose} wide>
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📥</span>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: '#0369a1', fontFamily: font }}>Step 1 — Download Template</span>
        </div>
        <p style={{ fontSize: 12.5, color: '#0c4a6e', marginBottom: 12, fontFamily: font }}>Download template Excel, isi data sesuai format, lalu upload.</p>
        <BtnGhost onClick={downloadTemplate} color="teal">⬇ Download Template Master Part</BtnGhost>
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
            <Table headers={[{label:'Part No'},{label:'Part No AS400'},{label:'Part Name'},{label:'Unit'},{label:'Supplier'},{label:'Status'}]} rows={preview.map(r => [r.part_no, r.part_no_as400, r.part_name, r.unit, r.supplier_name || '—', <Badge active={!!r.is_active} />])} />
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

function PartForm({ initial, onSave, onClose, existingPartNos }: {
  initial?: Part; onSave: (f: Partial<Part>) => void;
  onClose: () => void; existingPartNos: string[];
}) {
  const editing = !!initial;
  const [form, setForm] = useState({
    part_no:       initial?.part_no       ?? '',
    part_no_as400: initial?.part_no_as400 ?? '',
    part_name:     initial?.part_name     ?? '',
    unit:          initial?.unit          ?? 'PCS',
    supplier_code: initial?.supplier_code ?? '',
    supplier_name: initial?.supplier_name ?? '',
    is_active:     initial?.is_active     ?? true,
  });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const set = (k: string, v: unknown) => { setForm(f => ({...f,[k]:v})); setErrors(e => ({...e,[k]:''})); };

  const validate = () => {
    const e: Record<string,string> = {};
    if (!form.part_no.trim()) e.part_no = 'Part No wajib diisi';
    else if (!editing && existingPartNos.includes(form.part_no.trim())) e.part_no = 'Part No sudah ada';
    if (!form.part_no_as400.trim()) e.part_no_as400 = 'Part No AS400 wajib diisi';
    if (!form.part_name.trim()) e.part_name = 'Part Name wajib diisi';
    if (!form.unit) e.unit = 'Unit wajib dipilih';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...initial, ...form, part_no: form.part_no.trim(), part_no_as400: form.part_no_as400.trim(), part_name: form.part_name.trim() });
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Part No" required error={errors.part_no}><Input value={form.part_no} onChange={e => set('part_no', e.target.value)} placeholder="P-001" disabled={editing} /></Field>
        <Field label="Part No AS400" required error={errors.part_no_as400}><Input value={form.part_no_as400} onChange={e => set('part_no_as400', e.target.value)} placeholder="AS4-1001" /></Field>
      </div>
      <Field label="Part Name" required error={errors.part_name}><Input value={form.part_name} onChange={e => set('part_name', e.target.value)} placeholder="e.g. Bolt M8 x 20" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="Unit" required error={errors.unit}><Select value={form.unit} onChange={e => set('unit', e.target.value)} options={UNIT_OPTIONS} /></Field>
        <Field label="Supplier Code"><Input value={form.supplier_code ?? ''} onChange={e => set('supplier_code', e.target.value)} placeholder="PT A" /></Field>
      </div>
      <Field label="Supplier Name"><Input value={form.supplier_name ?? ''} onChange={e => set('supplier_name', e.target.value)} placeholder="PT Maju Jaya" /></Field>
      <Field label="Status"><Select value={form.is_active ? 'active' : 'inactive'} onChange={e => set('is_active', e.target.value === 'active')} options={['active','inactive']} /></Field>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
        <BtnGhost onClick={onClose} color="gray">Batal</BtnGhost>
        <BtnPrimary onClick={handleSave}>{editing ? 'Simpan Perubahan' : 'Tambah Part'}</BtnPrimary>
      </div>
    </>
  );
}

export default function MasterPartPage({ showToast, role }: {
  showToast: (msg: string, type: 'success' | 'error') => void;
  role: string;
}) {
  const canEdit   = role === 'MPC';     // tambah & edit
  const canDelete = role === 'FINANCE'; // hapus

  const [data, setData]             = useState<Part[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState<null | 'add' | { editing: Part }>(null);
  const [selected, setSelected]       = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch]         = useState('');
  const [filterUnit, setFilterUnit] = useState('ALL');
  const [page, setPage]             = useState(1);
  const [perPage, setPerPage]       = useState(10);

  const fetchData = () => {
    setLoading(true);
    fetch('/api/part').then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => { showToast('Gagal memuat data Part', 'error'); setLoading(false); });
  };
  useEffect(() => { fetchData(); }, []);

  const filtered = data.filter(r => {
    const q = search.toLowerCase();
    return ((r.part_no ?? '').toLowerCase().includes(q) || (r.part_name ?? '').toLowerCase().includes(q) || (r.supplier_name ?? '').toLowerCase().includes(q) || (r.part_no_as400 ?? '').toLowerCase().includes(q))
      && (filterUnit === 'ALL' || r.unit === filterUnit);
  });
  const paginated = filtered.slice((page-1)*perPage, page*perPage);

  const handleAdd = async (form: Partial<Part>) => {
    try {
      const res = await fetch('/api/part', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const created = await res.json();
      setData(d => [...d, created]); setModal(null); showToast('Part berhasil ditambahkan', 'success');
    } catch { showToast('Gagal menambah Part', 'error'); }
  };

  const handleEdit = async (form: Partial<Part>) => {
    try {
      const res = await fetch(`/api/part/${form.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const updated = await res.json();
      setData(d => d.map(r => r.id === updated.id ? updated : r)); setModal(null); showToast('Part berhasil diperbarui', 'success');
    } catch { showToast('Gagal memperbarui Part', 'error'); }
  };



  const handleDeleteBulk = async () => {
    try {
      await Promise.all([...selected].map(id => fetch(`/api/part/${id}`, { method: 'DELETE' })));
      setData(d => d.filter(r => !selected.has(r.id)));
      showToast(`${selected.size} Part berhasil dihapus`, 'success');
      setSelected(new Set()); setConfirmBulk(false);
    } catch { showToast('Gagal menghapus data', 'error'); }
  };

  const toggleSelect = (id: number) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll    = () => setSelected(s => s.size === paginated.length ? new Set() : new Set(paginated.map(r => r.id)));
  const allChecked   = paginated.length > 0 && paginated.every(r => selected.has(r.id));

  const units = ['ALL', ...new Set(data.map(r => r.unit))];

  const renderAksi = (r: Part) => {

    if (canEdit) {
      return <div style={{ display: 'flex', gap: 6 }}><BtnGhost onClick={() => setModal({ editing: r })} color="blue">Edit</BtnGhost></div>;
    }
    if (canDelete) {
      return <span style={{ fontSize: 11.5, color: '#9ca3af', fontStyle: 'italic' }}>Gunakan bulk select</span>;
    }
    return <span style={{ fontSize: 11.5, color: '#9ca3af', fontStyle: 'italic' }}>View only</span>;
  };

  const roleBanner = () => {
    if (canEdit)   return { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✏️', text: `Role <b>MPC</b> — dapat menambah dan mengedit data Part. Penghapusan hanya bisa dilakukan oleh Finance.` };
    if (canDelete) return { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: '🗑', text: `Role <b>FINANCE</b> — memiliki akses hapus data. Penambahan dan pengeditan hanya bisa dilakukan oleh MPC.` };
    return { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: '👁', text: `Role <b>${role}</b> — hanya dapat melihat data ini.` };
  };
  const banner = roleBanner();

  const tableRows = paginated.map(r => [
    canDelete ? (
      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }} />
    ) : null,
    <span style={{ fontWeight: 700, color: '#1d4ed8', fontFamily: 'monospace', fontSize: 13 }}>{r.part_no}</span>,
    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{r.part_no_as400}</span>,
    <span style={{ color: '#1f2937', fontWeight: 500 }}>{r.part_name}</span>,
    <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '3px 8px', fontSize: 11.5, fontWeight: 700 }}>{r.unit}</span>,
    r.supplier_code ? <span style={{ color: '#4b5563' }}>{r.supplier_code}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
    r.supplier_name ? <span style={{ color: '#4b5563' }}>{r.supplier_name}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
    <Badge active={r.is_active} />,
    renderAksi(r),
  ]);

  return (
    <div style={{ fontFamily: font }}>
      {/* Role banner */}
      <div style={{ background: banner.bg, border: `1px solid ${banner.border}`, borderRadius: 10, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: banner.color }}
        dangerouslySetInnerHTML={{ __html: `${banner.icon} ${banner.text}` }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Master Part</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Daftar Part / Material — <b style={{ color: '#374151' }}>{data.length}</b> total part</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>🔍</span>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Cari part no / nama / supplier..."
              style={{ padding: '9px 12px 9px 34px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', width: 260, background: '#fff', color: '#111827' }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,.1)'; }}
              onBlur={e =>  { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
          </div>
          <select value={filterUnit} onChange={e => { setFilterUnit(e.target.value); setPage(1); }} style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: font, outline: 'none', cursor: 'pointer', background: '#fff', color: '#374151' }}
            onFocus={e => { e.target.style.borderColor = '#3b82f6'; }} onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}>
            {units.map(u => <option key={u} value={u}>{u === 'ALL' ? 'Semua Unit' : u}</option>)}
          </select>
          {canEdit && (
            <>
              <BtnGhost onClick={() => setShowUpload(true)} color="teal">📤 Upload Excel</BtnGhost>
              <BtnPrimary onClick={() => setModal('add')}>+ Tambah Part</BtnPrimary>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Part"    value={data.length}                                  color="#1d4ed8" />
        <StatCard label="Active"        value={data.filter(r => r.is_active).length}         color="#16a34a" />
        <StatCard label="Supplier Unik" value={new Set(data.map(r => r.supplier_name)).size} color="#d97706" />
        <StatCard label="Jenis Unit"    value={new Set(data.map(r => r.unit)).size}          color="#7c3aed" />
      </div>

      {/* Table */}
      {/* Bulk action bar */}
      {canDelete && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>🗑 {selected.size} Part dipilih</span>
          <button onClick={() => setConfirmBulk(true)} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: font }}>Hapus Semua yang Dipilih</button>
          <button onClick={() => setSelected(new Set())} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: font }}>Batal Pilih</button>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <>
          <Table headers={[
              ...(canDelete ? [{label: <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#dc2626' }} /> as unknown as string}] : []),
              {label:'Part No'},{label:'Part No AS400'},{label:'Part Name'},{label:'Unit'},{label:'Supplier Code'},{label:'Supplier Name'},{label:'Status'},{label:'Aksi'}
            ]} rows={tableRows} />
          <Pagination total={filtered.length} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </>
      )}

      {canEdit && modal === 'add' && <Modal title="Tambah Part Baru" onClose={() => setModal(null)}><PartForm onSave={handleAdd} onClose={() => setModal(null)} existingPartNos={data.map(r => r.part_no)} /></Modal>}
      {canEdit && modal && typeof modal === 'object' && 'editing' in modal && <Modal title={`Edit — ${modal.editing.part_no}`} onClose={() => setModal(null)}><PartForm initial={modal.editing} onSave={handleEdit} onClose={() => setModal(null)} existingPartNos={data.map(r => r.part_no)} /></Modal>}
      {canDelete && confirmBulk && <ConfirmDialog msg={`Yakin ingin menghapus ${selected.size} Part sekaligus? Data tidak dapat dikembalikan.`} onConfirm={handleDeleteBulk} onCancel={() => setConfirmBulk(false)} />}

      {canEdit && showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={fetchData} showToast={showToast} />}
    </div>
  );
}
