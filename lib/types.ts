// Types
export interface Assy {
  id: number;
  assy_code: string;
  assy_number: number;
  sequence: number | null;
  carline: string | null;
  destinasi: string | null;
  komoditi: string | null;
  prod_qty: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Part {
  id: number;
  part_no: string;
  part_no_as400: string;
  part_name: string;
  unit: string;
  supplier_code: string | null;
  supplier_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const UNIT_OPTIONS = ['PCS', 'MTR', 'SET', 'KG', 'LTR', 'ROLL', 'BOX'];
