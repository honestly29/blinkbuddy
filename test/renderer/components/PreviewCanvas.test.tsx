import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PreviewCanvas } from '../../../src/renderer/components/PreviewCanvas'
import type { PythonEvent, PreviewFrameEvent } from '../../../src/shared/protocol'

let eventCallback: ((event: PythonEvent) => void) | null = null
const mockUnsubscribe = vi.fn()

beforeEach(() => {
  eventCallback = null
  mockUnsubscribe.mockClear()

  // Mock only onPythonEvent (the only API method PreviewCanvas uses).
  window.blinkBuddy = {
    onPythonEvent: vi.fn((cb) => {
      eventCallback = cb
      return mockUnsubscribe
    }),
  } as unknown as typeof window.blinkBuddy
})

afterEach(() => {
  // @ts-expect-error cleanup
  delete window.blinkBuddy
})

const previewFrame: PreviewFrameEvent = {
  type: 'preview_frame',
  data: '/9j/4AAQSkZJRg==',  // Base64 of a truncated JPEG header
  width: 320,
  height: 240,
  timestamp: 1000,
}

describe('PreviewCanvas', () => {
  // -- Conditional rendering tests --

  it('renders nothing when not visible', () => {
    const { container } = render(<PreviewCanvas visible={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when visible but no frame received', () => {
    const { container } = render(<PreviewCanvas visible={true} />)
    expect(container.innerHTML).toBe('')
  })

  // -- Subscription lifecycle tests --

  it('subscribes to onPythonEvent when visible', () => {
    render(<PreviewCanvas visible={true} />)
    expect(window.blinkBuddy.onPythonEvent).toHaveBeenCalledOnce()
  })

  it('does not subscribe when not visible', () => {
    // When not visible, the useEffect early-returns without subscribing
    render(<PreviewCanvas visible={false} />)
    expect(window.blinkBuddy.onPythonEvent).not.toHaveBeenCalled()
  })

  // -- Frame display tests --

  it('displays image when preview_frame event arrives', () => {
    render(<PreviewCanvas visible={true} />)

    // Simulate a preview_frame event arriving from the Python process
    act(() => {
      eventCallback!(previewFrame)
    })

    // Verify the <img> tag has the correct data URI, width, and height
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe(`data:image/jpeg;base64,${previewFrame.data}`)
    expect(img.getAttribute('width')).toBe('320')
    expect(img.getAttribute('height')).toBe('240')
  })

  it('ignores non-preview events', () => {
    const { container } = render(<PreviewCanvas visible={true} />)

    // Send a blink_event (not a preview_frame) through the callback.
    // The component should filter it out and NOT render an image.
    act(() => {
      eventCallback!({
        type: 'blink_event',
        timestamp: 1000,
        ear_value: 0.25,
        duration_ms: null,
      })
    })

    // No <img> should appear because only preview_frame events are handled
    expect(container.querySelector('img')).toBeNull()
  })

  // -- Cleanup tests --

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<PreviewCanvas visible={true} />)
    unmount()
    // The useEffect cleanup should call the unsubscribe function
    expect(mockUnsubscribe).toHaveBeenCalledOnce()
  })

  it('clears frame when visibility changes to false', () => {
    const { container, rerender } = render(<PreviewCanvas visible={true} />)

    // First, receive a frame so the image renders
    act(() => {
      eventCallback!(previewFrame)
    })

    expect(container.querySelector('img')).not.toBeNull()

    // Toggle visibility off: the useEffect sets frame to null and
    // the component returns null, removing the image from the DOM
    rerender(<PreviewCanvas visible={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('unsubscribes and resubscribes when visibility toggles', () => {
    const { rerender } = render(<PreviewCanvas visible={true} />)
    expect(window.blinkBuddy.onPythonEvent).toHaveBeenCalledTimes(1)  // First subscribe

    // Toggle off: useEffect cleanup runs, unsubscribing
    rerender(<PreviewCanvas visible={false} />)
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)

    // Toggle on: useEffect runs again, creating a new subscription
    rerender(<PreviewCanvas visible={true} />)
    expect(window.blinkBuddy.onPythonEvent).toHaveBeenCalledTimes(2)  // Second subscribe
  })
})