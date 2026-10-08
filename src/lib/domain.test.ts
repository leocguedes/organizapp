import{describe,expect,it}from'vitest';
import{formatQuantity,quantityStep,searchKey}from'../src/lib/domain';

describe('OrganizaApp domain helpers',()=>{
  it('searches without case or accent sensitivity',()=>{
    expect(searchKey('Açúcar')).toBe('acucar');
    expect(searchKey('  LEITE  ')).toBe('  leite  ');
    expect(searchKey('ÁGUA')).toBe('agua');
  });

  it('uses practical quantity steps',()=>{
    expect(quantityStep('kg')).toBe(0.1);
    expect(quantityStep('L')).toBe(0.1);
    expect(quantityStep('g')).toBe(1);
    expect(quantityStep('unidades')).toBe(1);
  });

  it('formats units correctly',()=>{
    expect(formatQuantity(1,'unidades')).toBe('1 unidade');
    expect(formatQuantity(2,'unidades')).toBe('2 unidades');
    expect(formatQuantity(1.5,'kg')).toBe('1.5 kg');
  });
});
