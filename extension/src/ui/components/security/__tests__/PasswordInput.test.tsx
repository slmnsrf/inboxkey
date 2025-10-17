/**
 * Tests for PasswordInput Component
 *
 * Tests password input field including:
 * - Rendering with props
 * - Show/hide toggle functionality
 * - Error display
 * - onChange handler
 * - Auto-focus behavior
 * - Accessibility attributes
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from '../PasswordInput'

describe('PasswordInput', () => {
  it('should render password input field', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" />)

    const input = screen.getByLabelText('Password')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'password')
  })

  it('should display label when provided', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Master Password" />)

    expect(screen.getByText('Master Password')).toBeInTheDocument()
  })

  it('should use placeholder text', () => {
    const onChange = vi.fn()

    render(
      <PasswordInput
        value=""
        onChange={onChange}
        label="Password"
        placeholder="Enter your password"
      />
    )

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('placeholder', 'Enter your password')
  })

  it('should toggle password visibility', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<PasswordInput value="password123" onChange={onChange} label="Password" />)

    const input = screen.getByLabelText('Password')
    const toggleButton = screen.getByRole('button', { name: /show password/i })

    // Initially hidden
    expect(input).toHaveAttribute('type', 'password')
    expect(toggleButton).toHaveAttribute('aria-label', 'Show password')

    // Click toggle to show
    await user.click(toggleButton)

    // Now visible
    expect(input).toHaveAttribute('type', 'text')
    expect(toggleButton).toHaveAttribute('aria-label', 'Hide password')

    // Click toggle to hide again
    await user.click(toggleButton)

    // Hidden again
    expect(input).toHaveAttribute('type', 'password')
    expect(toggleButton).toHaveAttribute('aria-label', 'Show password')
  })

  it('should call onChange handler when typing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" />)

    const input = screen.getByLabelText('Password')
    await user.type(input, 'test')

    expect(onChange).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledTimes(4) // Once per character
  })

  it('should display error message when provided', () => {
    const onChange = vi.fn()

    render(
      <PasswordInput
        value=""
        onChange={onChange}
        label="Password"
        error="Password is required"
      />
    )

    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Password is required')
  })

  it('should set aria-invalid when error is present', () => {
    const onChange = vi.fn()

    render(
      <PasswordInput
        value=""
        onChange={onChange}
        label="Password"
        error="Invalid password"
      />
    )

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('should link error message with aria-describedby', () => {
    const onChange = vi.fn()

    render(
      <PasswordInput
        value=""
        onChange={onChange}
        label="Password"
        id="test-input"
        error="Error message"
      />
    )

    const input = screen.getByLabelText('Password')
    const errorId = input.getAttribute('aria-describedby')

    expect(errorId).toBeTruthy()
    expect(document.getElementById(errorId!)).toHaveTextContent('Error message')
  })

  it('should auto-focus when autoFocus is true', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" autoFocus />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveFocus()
  })

  it('should not auto-focus when autoFocus is false', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" autoFocus={false} />)

    const input = screen.getByLabelText('Password')
    expect(input).not.toHaveFocus()
  })

  it('should disable input when disabled is true', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" disabled />)

    const input = screen.getByLabelText('Password')
    const toggleButton = screen.getByRole('button')

    expect(input).toBeDisabled()
    expect(toggleButton).toBeDisabled()
  })

  it('should not disable input when disabled is false', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" disabled={false} />)

    const input = screen.getByLabelText('Password')
    const toggleButton = screen.getByRole('button')

    expect(input).not.toBeDisabled()
    expect(toggleButton).not.toBeDisabled()
  })

  it('should use custom className', () => {
    const onChange = vi.fn()

    const { container } = render(
      <PasswordInput value="" onChange={onChange} label="Password" className="custom-class" />
    )

    const wrapper = container.querySelector('.custom-class')
    expect(wrapper).toBeInTheDocument()
  })

  it('should use custom id when provided', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" id="custom-id" />)

    const input = document.getElementById('custom-id')
    expect(input).toBeInTheDocument()
  })

  it('should generate unique id when not provided', () => {
    const onChange = vi.fn()

    const { container: container1 } = render(
      <PasswordInput value="" onChange={onChange} label="Password 1" />
    )
    const { container: container2 } = render(
      <PasswordInput value="" onChange={onChange} label="Password 2" />
    )

    const input1 = container1.querySelector('input')
    const input2 = container2.querySelector('input')

    expect(input1?.id).toBeTruthy()
    expect(input2?.id).toBeTruthy()
    expect(input1?.id).not.toBe(input2?.id)
  })

  it('should use custom name attribute', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" name="custom-name" />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('name', 'custom-name')
  })

  it('should use default name when not provided', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('name', 'password')
  })

  it('should have autocomplete attribute', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('autocomplete', 'current-password')
  })

  it('should not show error when no error provided', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('should display current value', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="my-password" onChange={onChange} label="Password" />)

    const input = screen.getByLabelText('Password')
    expect(input).toHaveValue('my-password')
  })

  it('should show value in plain text when visibility is toggled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<PasswordInput value="secret123" onChange={onChange} label="Password" />)

    const input = screen.getByLabelText('Password') as HTMLInputElement
    const toggleButton = screen.getByRole('button')

    // Initially password type hides the value
    expect(input.type).toBe('password')

    // Toggle to show
    await user.click(toggleButton)

    // Now text type shows the value
    expect(input.type).toBe('text')
    expect(input.value).toBe('secret123')
  })

  it('should have tabIndex -1 on toggle button', () => {
    const onChange = vi.fn()

    render(<PasswordInput value="" onChange={onChange} label="Password" />)

    const toggleButton = screen.getByRole('button')
    expect(toggleButton).toHaveAttribute('tabIndex', '-1')
  })
})
