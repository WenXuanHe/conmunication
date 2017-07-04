import '../styles/index.scss';
import io from 'socket.io-client';
import Chat from './chat';
import Info from './Info';

new Info(io, Chat);
