import { useEffect, useState } from 'react'

/** New key when the payload identity changes; rotate after a successful mutate. */
export function useIdempotencyKey(payloadIdentity: unknown) {
  const [key, setKey] = useState(() => crypto.randomUUID().replace(/-/g, '').slice(0, 32))
  const serialized = JSON.stringify(payloadIdentity)

  useEffect(() => {
    setKey(crypto.randomUUID().replace(/-/g, '').slice(0, 32))
  }, [serialized])

  return {
    key,
    rotate: () => setKey(crypto.randomUUID().replace(/-/g, '').slice(0, 32)),
  }
}
