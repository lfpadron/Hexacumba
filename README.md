# Hexacumba

Prototipo web offline-first de **Hexacumba: Paladin y Escudero**, un dungeon crawler tactico minimalista en tablero hexagonal.

La app no usa backend ni dependencias externas: solo HTML, CSS y modulos JavaScript nativos. El estado es serializable y se guarda en `localStorage`.

## Ejecutar

```bash
npm run dev
```

Abre `http://localhost:5173`.

## Probar

```bash
npm test
```

Las pruebas cubren:

- generacion y adyacencia de tablero hexagonal
- casillas alcanzables
- bloqueo por muros y ocupantes
- combate y ataque combinado
- apertura de cofres e inventario lleno
- muerte/remocion de monstruos
- avance por escaleras y progresion de ronda
- victoria, derrota y guardado serializado

## Flujo jugable

1. Inicia partida y elige avatares.
2. Activa opcionalmente cofres malditos.
3. Cada turno avanza por fases visibles: tirada, orden, movimiento del Paladin, movimiento del Escudero, ataque humano, monstruos y fin de turno.
4. Selecciona casillas del tablero para inspeccionar unidades, muros, cofres y escaleras.
5. Mueve al Paladin solo a casillas resaltadas.
6. Ataca monstruos adyacentes; si el Escudero esta junto al Paladin, puedes usar ataque combinado.
7. Cada clic en `Atacar` aplica un solo impacto: baja 1 vitalidad del monstruo y gasta puntos iguales a su defensa.
8. Al limpiar la ronda, lleva al Paladin a las escaleras, elige mejoras y baja a la siguiente ronda.

## Guardado

La barra superior permite:

- Nueva partida
- Guardar partida
- Continuar partida
- Borrar partida guardada

El guardado incluye ronda, nivel, tablero, unidades, inventarios, configuracion, estadisticas de resumen y log reciente.

## Offline

`service-worker.js` cachea el app shell despues de la primera carga. Si se modifica el codigo, sube `CACHE_NAME` para invalidar el cache anterior.
