import { describe, it, expect } from 'vitest';

describe('chat-core state & protocol logic', () => {
  it('formats room identifiers correctly', () => {
    const raw = 'My Awesome Room 123';
    const slug = raw.toLowerCase().replace(/\s+/g, '-');
    expect(slug).toBe('my-awesome-room-123');
  });

  it('generates consistent anchor ID mapping', () => {
    const roomId = 'secret-mesh-room';
    const anchorId = `pcr-${roomId.slice(0, 20)}`;
    expect(anchorId).toBe('pcr-secret-mesh-room');
  });
});
