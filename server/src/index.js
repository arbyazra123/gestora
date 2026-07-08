import { Server } from 'colyseus';
import { HandSwordRoom } from './rooms/HandSwordRoom.js';
import { TennisRoom } from './rooms/TennisRoom.js';

const port = Number(process.env.PORT) || 2567;

const gameServer = new Server();

// Room name doubles as the game's registry id ("hand-sword"/"tennis"), so
// MultiplayerService can pass gameId straight through with no mapping table.
gameServer.define('hand-sword', HandSwordRoom);
gameServer.define('tennis', TennisRoom);

gameServer.listen(port);
console.log(`[server] Colyseus listening on ws://localhost:${port}`);
