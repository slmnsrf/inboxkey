/**
 * Helper utilities for measuring memory usage in E2E tests
 */

import type { BrowserContext, Page } from '@playwright/test'

export interface MemoryMetrics {
  usedJSHeapSize: number // Bytes
  totalJSHeapSize: number // Bytes
  jsHeapSizeLimit: number // Bytes
}

/**
 * Get memory usage for a page
 */
export async function getMemoryUsage(page: Page): Promise<number> {
  const metrics = await page.evaluate(() => {
    // Check if performance.memory is available (Chrome only)
    if ('memory' in performance) {
      const memory = (performance as any).memory
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      }
    }
    return null
  })

  if (!metrics) {
    throw new Error('performance.memory is not available (Chrome only feature)')
  }

  return metrics.usedJSHeapSize
}

/**
 * Get detailed memory metrics for a page
 */
export async function getDetailedMemoryMetrics(page: Page): Promise<MemoryMetrics> {
  const metrics = await page.evaluate(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      }
    }
    throw new Error('performance.memory is not available')
  })

  return metrics
}

/**
 * Get memory usage across all pages in a context
 */
export async function getTotalMemoryUsage(context: BrowserContext): Promise<number> {
  const pages = context.pages()
  let totalMemory = 0

  for (const page of pages) {
    try {
      const memory = await getMemoryUsage(page)
      totalMemory += memory
    } catch (error) {
      // Skip pages that don't support performance.memory
      console.warn(`Could not get memory for page: ${page.url()}`)
    }
  }

  return totalMemory
}

/**
 * Take a heap snapshot for detailed memory analysis
 * Note: This requires Chrome DevTools Protocol
 */
export async function takeHeapSnapshot(page: Page): Promise<void> {
  // Create a client to communicate with Chrome DevTools Protocol
  const client = await page.context().newCDPSession(page)

  // Enable heap profiler
  await client.send('HeapProfiler.enable')

  // Take snapshot
  await client.send('HeapProfiler.takeHeapSnapshot', {
    reportProgress: false,
  })

  // Disable heap profiler
  await client.send('HeapProfiler.disable')
}

/**
 * Force garbage collection (requires --js-flags=--expose-gc)
 * This is useful for measuring true memory leaks
 */
export async function forceGarbageCollection(page: Page): Promise<void> {
  await page.evaluate(() => {
    if ('gc' in window) {
      (window as any).gc()
    } else {
      console.warn('Garbage collection not available (need --js-flags=--expose-gc)')
    }
  })
}

/**
 * Measure memory increase over a period of time
 */
export async function measureMemoryIncrease(
  page: Page,
  operation: () => Promise<void>,
  gcBefore = true,
  gcAfter = true
): Promise<{
  before: number
  after: number
  increase: number
  increasePercentage: number
}> {
  // Force GC before measurement
  if (gcBefore) {
    await forceGarbageCollection(page)
    await page.waitForTimeout(100) // Let GC complete
  }

  const memoryBefore = await getMemoryUsage(page)

  // Perform the operation
  await operation()

  // Force GC after measurement
  if (gcAfter) {
    await forceGarbageCollection(page)
    await page.waitForTimeout(100) // Let GC complete
  }

  const memoryAfter = await getMemoryUsage(page)
  const increase = memoryAfter - memoryBefore
  const increasePercentage = (increase / memoryBefore) * 100

  return {
    before: memoryBefore,
    after: memoryAfter,
    increase,
    increasePercentage,
  }
}

/**
 * Monitor memory usage over time
 */
export async function monitorMemoryUsage(
  page: Page,
  durationMs: number,
  intervalMs = 1000
): Promise<number[]> {
  const samples: number[] = []
  const startTime = Date.now()

  while (Date.now() - startTime < durationMs) {
    try {
      const memory = await getMemoryUsage(page)
      samples.push(memory)
    } catch (error) {
      console.warn('Failed to get memory sample:', error)
    }

    await page.waitForTimeout(intervalMs)
  }

  return samples
}

/**
 * Calculate memory statistics from samples
 */
export function calculateMemoryStats(samples: number[]): {
  min: number
  max: number
  average: number
  median: number
  stdDev: number
} {
  if (samples.length === 0) {
    throw new Error('No samples provided')
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const sum = samples.reduce((a, b) => a + b, 0)
  const average = sum / samples.length

  const median = sorted[Math.floor(sorted.length / 2)]

  // Calculate standard deviation
  const squaredDiffs = samples.map(value => Math.pow(value - average, 2))
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / samples.length
  const stdDev = Math.sqrt(avgSquaredDiff)

  return { min, max, average, median, stdDev }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
