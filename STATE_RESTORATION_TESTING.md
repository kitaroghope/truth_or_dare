# State Restoration Testing Guide

This document outlines test scenarios for verifying that game state is properly persisted and restored when players refresh their browser or reconnect.

## Overview

The state restoration system allows players to:
- Refresh their browser without losing game progress
- Reconnect after temporary disconnection
- Resume exactly where they left off in the game flow

## Architecture Changes

### What Changed
1. **Database Schema**: Added `game_phase` field to track current game phase
2. **In-Memory State**: Changed from socket.id-based to username-based keys
3. **Database Sync**: Every state change is persisted to database with 500ms debounce
4. **State Restoration**: Full state loaded from database on joinRoom event
5. **Client Handler**: New `fullStateRestoration` event restores complete UI state

### Key Files Modified
- `db/schema.js` - Added game_phase field
- `db/index.js` - Added migration for game_phase column
- `utils/gameStateSync.js` - NEW FILE - Database sync utilities
- `app.js` - Refactored all Socket.io handlers to use username-based tracking
- `public/client.js` - Added fullStateRestoration event handler

## Test Scenarios

### Scenario 1: Refresh During Lobby Phase

**Setup:**
1. Player A joins room "test123" with username "Alice"
2. Player B joins room "test123" with username "Bob"
3. Both players see "Waiting for opponent..." message
4. RPS buttons are enabled

**Test Steps:**
1. Player A refreshes their browser (F5)
2. Player A re-enters username "Alice" and rejoins room "test123"

**Expected Results:**
- ✅ Player A sees the same lobby screen
- ✅ RPS buttons are enabled
- ✅ Player B's username is still shown: "Talking to: Bob"
- ✅ Chat history is restored
- ✅ No game state is lost

**Database Verification:**
```sql
SELECT game_phase, status FROM games WHERE room_code = 'test123';
-- Expected: game_phase = 'lobby', status = 'in_progress'
```

---

### Scenario 2: Refresh After Making Choice

**Setup:**
1. Player A and Player B are in room "test123"
2. Player A clicks "Rock" button
3. Player A sees "Waiting for other player..." message
4. Player B has not made a choice yet

**Test Steps:**
1. Player A refreshes their browser
2. Player A rejoins the room

**Expected Results:**
- ✅ Player A sees "Waiting for other player..." message
- ✅ RPS buttons are disabled/dimmed
- ✅ Player A cannot make another choice
- ✅ When Player B makes their choice, the game continues normally

**Database Verification:**
```sql
SELECT game_phase, game_state FROM games WHERE room_code = 'test123';
-- Expected: game_phase = 'choosing'
-- game_state JSON should contain: {"choices": {"Alice": "rock"}}
```

---

### Scenario 3: Refresh After Winning Round

**Setup:**
1. Player A chose "Rock", Player B chose "Scissors"
2. Player A sees: "You win! You may ask a truth or give a dare."
3. Player B sees: "You lose! Choose Truth or Dare."
4. Modal is shown to Player B to choose Truth or Dare
5. Chat section is now visible

**Test Steps:**
1. Player A (winner) refreshes their browser
2. Player A rejoins the room

**Expected Results:**
- ✅ Player A sees "You win! You may ask a truth or give a dare." message
- ✅ RPS section is hidden
- ✅ Chat section is visible
- ✅ "New Round" button is visible
- ✅ Modal shows "Waiting for [Bob] to choose..." (waiting state)

**Database Verification:**
```sql
SELECT game_phase, game_state FROM games WHERE room_code = 'test123';
-- Expected: game_phase = 'truth_dare_selection'
-- game_state JSON should contain:
-- {"winner": "Alice", "loser": "Bob", "awaitingTruthDare": true, "chatVisible": true}
```

---

### Scenario 4: Refresh After Losing Round

**Setup:**
1. Player A chose "Rock", Player B chose "Paper"
2. Player A sees: "You lose! Choose Truth or Dare."
3. Player B sees: "You win! You may ask a truth or give a dare."
4. Modal is shown to Player A to choose Truth or Dare

**Test Steps:**
1. Player A (loser) refreshes their browser
2. Player A rejoins the room

**Expected Results:**
- ✅ Player A sees "You lose! Choose Truth or Dare." message
- ✅ RPS section is hidden
- ✅ Chat section is visible
- ✅ Modal shows Truth/Dare choice buttons
- ✅ Player A can select Truth or Dare
- ✅ After selection, game continues normally

**Database Verification:**
```sql
SELECT game_phase, game_state FROM games WHERE room_code = 'test123';
-- Expected: game_phase = 'truth_dare_selection'
-- game_state JSON should contain:
-- {"winner": "Bob", "loser": "Alice", "awaitingTruthDare": true}
```

---

### Scenario 5: Refresh During Chat Phase

**Setup:**
1. Player A won the round
2. Player B chose "Dare"
3. Players are now in chat phase
4. Chat section is visible
5. Players are exchanging messages

**Test Steps:**
1. Either player refreshes their browser
2. Player rejoins the room

**Expected Results:**
- ✅ RPS section is hidden
- ✅ Chat section is visible
- ✅ Chat input is enabled
- ✅ "New Round" button is visible
- ✅ All previous chat messages are restored
- ✅ Result message shows who won/lost

**Database Verification:**
```sql
SELECT game_phase, game_state FROM games WHERE room_code = 'test123';
-- Expected: game_phase = 'chat'
-- game_state JSON should contain:
-- {"winner": "Alice", "loser": "Bob", "truthDareSelection": "Dare", "chatVisible": true}
```

---

### Scenario 6: Both Players Refresh Simultaneously

**Setup:**
1. Player A and Player B are in any game phase
2. Game state is in database

**Test Steps:**
1. Both players close their browsers
2. Wait 10 seconds
3. Both players reopen browsers and rejoin room

**Expected Results:**
- ✅ Both players restore to the exact same game state
- ✅ No state conflicts or desynchronization
- ✅ Game continues from where it left off
- ✅ No duplicate data or corruption

**Database Verification:**
```sql
SELECT game_phase, status, updated_at FROM games WHERE room_code = 'test123';
-- Verify that updated_at timestamp is recent
-- Verify no duplicate rows exist for the same room_code
```

---

### Scenario 7: Refresh After Tie

**Setup:**
1. Both players chose "Rock"
2. Result: "It's a tie"
3. Game state resets to lobby
4. RPS buttons are re-enabled

**Test Steps:**
1. Either player refreshes their browser
2. Player rejoins the room

**Expected Results:**
- ✅ Player sees lobby phase
- ✅ RPS buttons are enabled
- ✅ Result message is cleared or shows tie message
- ✅ Chat section is hidden
- ✅ Game is ready for new round

**Database Verification:**
```sql
SELECT game_phase, game_state FROM games WHERE room_code = 'test123';
-- Expected: game_phase = 'lobby'
-- game_state JSON should have empty choices: {"choices": {}}
```

---

### Scenario 8: Long Disconnection (Over 5 Minutes)

**Setup:**
1. Player A and Player B are playing
2. Player A disconnects (closes browser)
3. Wait 6 minutes

**Test Steps:**
1. Player A tries to rejoin after 6 minutes
2. Player A enters same username and room code

**Expected Results:**
- ✅ In-memory state is cleared (5-minute timeout)
- ✅ Database state still exists
- ✅ Player A's state is restored from database
- ✅ If Player B is still connected, they can see Player A rejoin
- ✅ Game continues normally

**Database Verification:**
```sql
SELECT game_phase, updated_at FROM games WHERE room_code = 'test123';
-- Verify game still exists in database even after in-memory cleanup
-- updated_at should be from the last state save, not the rejoin
```

---

### Scenario 9: Different Username Rejoin Attempt

**Setup:**
1. Player A (username: "Alice") is in room "test123"
2. Player B (username: "Bob") is in room "test123"
3. Game is in progress

**Test Steps:**
1. Player A disconnects
2. Player A tries to rejoin with different username "AliceNew"
3. Room already has 2 players (Bob + Alice's old session)

**Expected Results:**
- ✅ Player sees "Room is full" message if trying as 3rd player
- ✅ OR if original session expired, new username is accepted
- ✅ Original "Alice" session data remains in database

**Notes:**
- This tests edge case handling
- Username change after disconnect is not recommended

---

### Scenario 10: State Restoration After Server Restart

**Setup:**
1. Game state is saved in database
2. Server is restarted (npm restart)
3. In-memory state is lost

**Test Steps:**
1. Stop the server (Ctrl+C)
2. Restart the server (npm start)
3. Players rejoin the room

**Expected Results:**
- ✅ Game state is fully restored from database
- ✅ All game phases are restored correctly
- ✅ No data loss
- ✅ Game continues seamlessly

**Database Verification:**
```sql
SELECT * FROM games WHERE room_code = 'test123';
-- Verify all data persisted correctly across server restart
```

---

## Testing Checklist

### Phase-Specific Tests
- [ ] Refresh during lobby phase
- [ ] Refresh during choosing phase (after making choice)
- [ ] Refresh during result phase (winner)
- [ ] Refresh during result phase (loser)
- [ ] Refresh during truth/dare selection phase
- [ ] Refresh during chat phase
- [ ] Refresh after tie

### Edge Cases
- [ ] Both players refresh simultaneously
- [ ] Refresh during network lag
- [ ] Disconnect for >5 minutes (memory cleanup)
- [ ] Server restart with active games
- [ ] Database migration from old to new schema

### UI Restoration
- [ ] RPS buttons enabled/disabled state
- [ ] Chat section visibility
- [ ] New Round button visibility
- [ ] Result messages
- [ ] Truth/Dare modal state
- [ ] Player list
- [ ] Chat history

### Database Integrity
- [ ] No duplicate game records
- [ ] game_phase field updates correctly
- [ ] game_state JSON structure is valid
- [ ] No orphaned records
- [ ] Timestamps update correctly

---

## Manual Testing Steps

### 1. Setup Test Environment

```bash
# Start the server
npm start

# Open two browser windows/tabs
# Browser A: http://localhost:3000?group=test123&user=Alice
# Browser B: http://localhost:3000?group=test123&user=Bob
```

### 2. Test Each Scenario

For each scenario above:
1. Follow the setup steps
2. Execute the test steps
3. Verify expected results
4. Check database state (optional)
5. Document any issues

### 3. Database Inspection

```bash
# SQLite
sqlite3 chat.db

# Check game state
SELECT
  room_code,
  game_phase,
  status,
  game_state,
  datetime(updated_at, 'unixepoch', 'localtime') as last_updated
FROM games
WHERE room_code = 'test123';
```

### 4. Browser Console Logging

Enable verbose logging:
```javascript
// In browser console
localStorage.setItem('debug', 'socket.io-client:*');
```

Look for:
- ✅ "Restoring full game state:" log message
- ✅ "State restored: phase=..." confirmation
- ❌ Any error messages or warnings

---

## Common Issues and Solutions

### Issue: State not restoring after refresh

**Possible Causes:**
- Database not initialized (run `npm run migrate`)
- Username mismatch (case-sensitive)
- Room code mismatch

**Solution:**
1. Check browser console for errors
2. Verify database has the game record
3. Ensure username and room code match exactly

### Issue: Both players have different states

**Possible Causes:**
- Race condition in database saves
- Network lag causing out-of-order updates

**Solution:**
- Database saves are debounced (500ms)
- Last write wins
- Both players should refresh to sync

### Issue: Old choices persisting after new round

**Possible Causes:**
- startNewRound not clearing choices object
- Database not saving clean state

**Solution:**
- Verify startNewRound clears `games[room].choices = {}`
- Check database game_state JSON is empty after reset

---

## Performance Testing

### Database Write Frequency

**Test:**
1. Play 10 rounds quickly
2. Check number of database writes

**Expected:**
- Debounce reduces writes to ~1 per 500ms per room
- Not every state change writes immediately

### Memory Usage

**Test:**
1. Create 100 rooms with 2 players each
2. Monitor Node.js memory usage

**Expected:**
- In-memory state is lightweight
- Old/empty rooms are cleaned up after 5 minutes

### Database Query Performance

**Test:**
1. Add 1000 game records to database
2. Measure loadGameState() execution time

**Expected:**
- Query time < 50ms (with indexed room_code)
- No N+1 query issues

---

## Success Criteria

The state restoration feature is considered complete when:

- ✅ All 10 test scenarios pass
- ✅ No data loss on refresh in any game phase
- ✅ Both players always see synchronized state
- ✅ Database correctly persists all game phases
- ✅ Client UI fully restores after reconnection
- ✅ No console errors during state restoration
- ✅ Performance is acceptable (<500ms restoration time)
- ✅ Edge cases are handled gracefully

---

## Migration Testing

### Existing Games Migration

For users with existing games before this update:

**Test Steps:**
1. Create games using old code (without state restoration)
2. Update to new code
3. Run migration: `npm run migrate`
4. Join existing games

**Expected Results:**
- ✅ Old games get `game_phase` column (will be NULL initially)
- ✅ First state save populates game_phase correctly
- ✅ No errors during migration
- ✅ Existing game_state JSON remains valid

---

## Automated Testing (Future)

Recommended automated tests to add:

1. **Unit Tests** (Jest)
   - `loadGameState()` function
   - `saveGameState()` function
   - Username mapping helpers

2. **Integration Tests** (Supertest)
   - Socket.io event handlers
   - Database sync after state changes

3. **E2E Tests** (Playwright/Puppeteer)
   - Full game flow with refresh
   - Two-player state synchronization

---

## Rollback Plan

If critical issues are found:

1. **Immediate Rollback:**
   ```bash
   git revert HEAD~1
   npm install
   npm start
   ```

2. **Database Rollback:**
   ```sql
   -- Remove game_phase column if needed
   ALTER TABLE games DROP COLUMN game_phase;
   ```

3. **Keep User Data:**
   - Only revert code, not database
   - Users can continue games with old behavior

---

## Contact

For issues or questions about state restoration:
- Check application logs for errors
- Review database game_state JSON
- Open GitHub issue with reproduction steps
- Include browser console logs

---

**Last Updated:** 2025-01-11
**Feature Version:** 2.0.0
**Status:** ✅ Implementation Complete - Ready for Testing
