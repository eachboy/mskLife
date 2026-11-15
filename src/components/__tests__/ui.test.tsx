import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Slider } from '../ui/Slider'
import { StartScreen } from '../StartScreen'

describe('Slider', () => {
  it('reports values 0..1', () => {
    const onChange = vi.fn()
    render(<Slider value={0.5} onChange={onChange} label="Музыка" />)
    fireEvent.change(screen.getByLabelText('Музыка'), { target: { value: '80' } })
    expect(onChange).toHaveBeenCalledWith(0.8)
  })
})

describe('StartScreen', () => {
  it('enter button calls onEnter and is disabled when busy', () => {
    const onEnter = vi.fn()
    const { rerender } = render(<StartScreen onEnter={onEnter} busy={false} />)
    fireEvent.click(screen.getByTestId('enter-button'))
    expect(onEnter).toHaveBeenCalledTimes(1)
    rerender(<StartScreen onEnter={onEnter} busy />)
    expect(screen.getByTestId('enter-button')).toBeDisabled()
  })
})
