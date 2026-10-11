// three.js non porta i propri tipi e @types/three richiede un TypeScript più recente di quello del progetto (4.4):
// i moduli si usano senza tipi.
declare module "three";
declare module "three/examples/jsm/environments/RoomEnvironment.js";
