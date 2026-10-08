export type Unit='unidades'|'pacotes'|'latas'|'garrafas'|'kg'|'g'|'L'|'ml';

export const units:Unit[]=['unidades','pacotes','latas','garrafas','kg','g','L','ml'];

export const searchKey=(value:string)=>value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();

export const formatQuantity=(quantity:number,unit:Unit)=>unit==='unidades'?quantity+' '+(quantity===1?'unidade':'unidades'):quantity+' '+unit;

export const quantityStep=(unit:Unit)=>unit==='kg'||unit==='L'?0.1:1;
