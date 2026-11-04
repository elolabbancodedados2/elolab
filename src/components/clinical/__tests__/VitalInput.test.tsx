import { fireEvent, render, screen } from '@testing-library/react';
import { Heart } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { VitalInput } from '../VitalInput';

describe('campo vital compartilhado', () => {
  it('associa rótulo, mantém decimal digitado e respeita modo leitura', () => {
    const change = vi.fn();
    const { rerender } = render(<VitalInput icon={Heart} label="Temperatura" value="36,5" unit="°C" onChange={change} />);
    fireEvent.change(screen.getByLabelText('Temperatura'), { target: { value: '37,2' } });
    expect(change).toHaveBeenCalledWith('37,2');
    rerender(<VitalInput icon={Heart} label="Temperatura" value="37,2" disabled onChange={change} />);
    expect(screen.getByLabelText('Temperatura')).toBeDisabled();
  });
});
