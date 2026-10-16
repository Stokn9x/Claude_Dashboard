// What the page knows right now, shared by every part of it: the state the
// server last sent, which session is in view, who is selected, and where each
// figure stood in the last frame.
import { remembered } from './util.js'

const focusKey = remembered('focus')

export const store = {
  state: { sessions: [], game: null, token: null },
  focusKey,
  // A session picked by hand stays in view while it lives.
  isChosen: focusKey !== null,
  // Whose details card is open: { kind: 'claude' | 'sub', id }
  selected: null,
  // Where each figure stood in the last frame, for clicks:
  // { kind, id, x0, y0, x1, y1 } in world units, later entries drawn on top.
  hits: [],
}

export const focused = () => store.state.sessions.find(s => s.key === store.focusKey) ?? store.state.sessions[0] ?? null

// Whether something is bought; everything counts as bought until the server
// has said what is.
export const owns = item => !item || !store.state.game || (store.state.game.owned?.rooms ?? []).includes(item)
