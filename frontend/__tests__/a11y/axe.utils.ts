import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

export async function checkA11y(container: HTMLElement, options = {}) {
  const results = await axe(container, {
    rules: {
      region: { enabled: true },
    },
    ...options,
  })

  expect(results).toHaveNoViolations()
  return results
}

export default checkA11y
