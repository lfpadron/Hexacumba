# Hexacumba

Prototipo web offline-first de **Hexacumba: Paladin y Escudero**, un dungeon crawler tactico minimalista en tablero hexagonal.

## Ejecutar

```bash
npm run dev
```

Abre `http://localhost:5173`.

La app no necesita backend ni dependencias descargadas. Usa HTML, CSS y modulos JavaScript nativos.

## Probar

```bash
npm test
```

Las pruebas cubren generacion de tablero hexagonal, adyacencia, combate, apertura de cofres, victoria y derrota.

## Controles

- Elige avatares y si quieres activar cofres malditos.
- Cada turno confirma la orden del Escudero.
- Haz clic en una casilla resaltada para mover al Paladin.
- Ataca monstruos adyacentes o termina el ataque para resolver el turno enemigo.
- Usa objetos desde el inventario de cada personaje.
- Al limpiar una ronda, elige una mejora para cada heroe.

La partida puede guardarse y continuarse con `localStorage`. El `service-worker.js` cachea la app para uso offline despues de la primera carga.
# Hexacumba
