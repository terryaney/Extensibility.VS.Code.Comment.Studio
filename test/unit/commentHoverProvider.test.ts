import { describe, it, expect } from 'vitest';
import { detectEnumMember } from '../../src/rendering/signatureUtils';

describe('detectEnumMember', () => {
  describe('valid enum members', () => {
    it('returns name only when there is no assignment', () => {
      expect(detectEnumMember('Foo')).toEqual({ name: 'Foo', value: undefined });
    });

    it('returns name and value for integer assignment', () => {
      expect(detectEnumMember('Weeks = 5')).toEqual({ name: 'Weeks', value: '5' });
    });

    it('strips trailing comma', () => {
      expect(detectEnumMember('Weeks = 5,')).toEqual({ name: 'Weeks', value: '5' });
    });

    it('handles trailing comma with no assignment', () => {
      expect(detectEnumMember('Days,')).toEqual({ name: 'Days', value: undefined });
    });

    it('handles zero assignment', () => {
      expect(detectEnumMember('None = 0')).toEqual({ name: 'None', value: '0' });
    });

    it('handles negative integer assignment', () => {
      expect(detectEnumMember('Invalid = -1')).toEqual({ name: 'Invalid', value: '-1' });
    });

    it('handles negative integer with trailing comma', () => {
      expect(detectEnumMember('Invalid = -1,')).toEqual({ name: 'Invalid', value: '-1' });
    });

    it('handles hex literal assignment', () => {
      expect(detectEnumMember('Flag = 0x01')).toEqual({ name: 'Flag', value: '0x01' });
    });

    it('handles hex literal with trailing comma', () => {
      expect(detectEnumMember('Flag = 0xFF,')).toEqual({ name: 'Flag', value: '0xFF' });
    });

    it('handles underscore-prefixed name', () => {
      expect(detectEnumMember('_Reserved = 99')).toEqual({ name: '_Reserved', value: '99' });
    });

    it('handles last enum member with no trailing comma and no value', () => {
      expect(detectEnumMember('Last')).toEqual({ name: 'Last', value: undefined });
    });

    it('trims value whitespace', () => {
      expect(detectEnumMember('Years =  1')).toEqual({ name: 'Years', value: '1' });
    });
  });

  describe('lines that are NOT enum members', () => {
    it('rejects a closing brace', () => {
      expect(detectEnumMember('}')).toBeUndefined();
    });

    it('rejects public method', () => {
      expect(detectEnumMember('public void Foo()')).toBeUndefined();
    });

    it('rejects private field', () => {
      expect(detectEnumMember('private int _count;')).toBeUndefined();
    });

    it('rejects class declaration', () => {
      expect(detectEnumMember('public class Bar')).toBeUndefined();
    });

    it('rejects interface declaration', () => {
      expect(detectEnumMember('interface IFoo')).toBeUndefined();
    });

    it('rejects struct declaration', () => {
      expect(detectEnumMember('struct Point')).toBeUndefined();
    });

    it('rejects enum declaration keyword itself', () => {
      expect(detectEnumMember('enum DateInterval')).toBeUndefined();
    });

    it('rejects static modifier', () => {
      expect(detectEnumMember('static readonly int Max = 10')).toBeUndefined();
    });

    it('rejects property declaration', () => {
      expect(detectEnumMember('int Count { get; set; }')).toBeUndefined();
    });

    it('rejects abstract method', () => {
      expect(detectEnumMember('abstract void Execute();')).toBeUndefined();
    });

    it('rejects line with parentheses', () => {
      expect(detectEnumMember('Foo(int x)')).toBeUndefined();
    });

    it('rejects empty string', () => {
      expect(detectEnumMember('')).toBeUndefined();
    });
  });
});
