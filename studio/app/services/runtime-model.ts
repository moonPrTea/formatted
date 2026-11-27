export interface RuntimeNode {
  id: number;
  name: string;
  type: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  enabled: boolean;
  backColor: string;
  foreColor: string;
  check: boolean;
  password: boolean;
  readOnly: boolean;
  multiline: boolean;
  maxLength: number;
  items: string[];
  selectedIndex: number;
  minimum: number;
  maximum: number;
  value: number;
  children: RuntimeNode[];
  grid?: RuntimeGrid | null;
  dropDownStyle?: string;
}
export interface RuntimeGrid {
  columns: {name: string; header: string; width: number; visible: boolean}[];
  rows: {id: number; cells: {text: string; readOnly: boolean}[]}[];
  selected: number | null;
  currentColumn: number;
  fill: boolean;
  headers: boolean;
  rowHeaders: boolean;
  add: boolean;
  delete: boolean;
  error: string;
}
export interface RuntimeSnapshot {
  form: RuntimeNode;
  ack: number;
  focus: number;
  disabled: boolean;
}
export interface RuntimeEvent {
  id: number;
  kind: 'click' | 'text' | 'check' | 'select' | 'grid';
  value?: string | boolean | number;
  seq: number;
}
