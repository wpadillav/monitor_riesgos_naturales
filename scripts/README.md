# Scripts de desarrollo

## `generar-zonas.js`: zonas de país con franja marina (ADR-0005)

Genera `src/shared/zonas.js`, el módulo versionado con las cinco zonas (`ES-PEN`, `ES-CAN`,
`CO-CONT`, `CO-SAI` y `PA`). Para cada zona guarda:

- `zona`: el territorio más una franja de 100 km **solo sobre el mar**, es decir, sin la tierra
  de los países vecinos;
- `tierra`: el territorio propio, que se usa para desempatar en la frontera Colombia-Panamá;
- `rectangulo`: el rectángulo de consulta a las fuentes. Se **calcula** como la envolvente de
  `zona` más 0,1°, redondeada hacia fuera a 0,1°, así que siempre contiene el contorno ampliado.

Solo se ejecuta en desarrollo. Usa `@turf/buffer`, `@turf/difference`, `@turf/simplify` y
`@turf/bbox` (todas en `devDependencies`); nada de esto llega a producción.

### Cómo regenerarlo

```sh
source ~/.nvm/nvm.sh && nvm use      # Node 24.21.0 (STACK.lock)
npm ci
npm run zonas                        # franja de 100 km
FRANJA_KM=80 npm run zonas           # otra franja (entero de 1 a 500)
npm test                             # las pruebas de tests/unit/shared/ deben seguir en verde
```

Tarda unos 20 s. Después revisa el diff de `src/shared/zonas.js` y anota el cambio en el commit.

### Entradas

1. **Natural Earth 10m `admin_0_countries` v5.1.2**, de dominio público
   ([condiciones de uso](https://www.naturalearthdata.com/about/terms-of-use/)). El script lo
   descarga la primera vez de
   `raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson`,
   comprueba el SHA-256
   `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255` (13 287 234 bytes) y lo
   guarda en `.cache/natural-earth/`, que git ignora. En cada ejecución vuelve a comprobar el
   hash del archivo de la caché; si no coincide, se detiene. Para forzar la descarga, borra esa
   carpeta.
2. **`datos/territorios-extra.geojson`**: correcciones manuales para lo que Natural Earth no
   asigna a España (STACK.lock A9), con la fuente de sus coordenadas en cada elemento:
   - isla de Alborán;
   - Peñón de Vélez de la Gomera.

### Pasos

1. Cada parte del país se asigna a una zona por el centro de su envolvente:
   - Canarias: al sur de 31° N;
   - San Andrés, Providencia y Roncador: al norte de 11° N y al oeste de 79,5° O.

   Serranilla y Bajo Nuevo son entidades propias en Natural Earth, así que quedan fuera de
   Colombia, como pide el PRD.
2. `@turf/buffer` amplía cada zona por separado, para limitar la distorsión de la proyección.
3. Se resta la tierra de todos los demás países cuya envolvente toca la zona ampliada. Antes, a
   esa tierra se le resta la tierra propia: así un territorio propio que Natural Earth solapa con
   el de un vecino, como el Peñón de Vélez dentro de Marruecos, no desaparece.
4. `@turf/simplify` simplifica `zona` y `tierra` con una tolerancia de 0,01° (≈ 1 km), y las
   coordenadas se redondean a 3 decimales (≈ 110 m).
5. Se calcula el rectángulo de cada zona.

### Reproducibilidad

La salida es determinista. No incluye la fecha de generación: dos ejecuciones con la misma
entrada producen el mismo archivo byte a byte, y `git diff src/shared/zonas.js` queda vacío.
`META_ZONAS` registra la franja, la fuente con su versión y su SHA-256, las correcciones, las
versiones de Turf, la tolerancia, los decimales y el número de vértices por zona.

El archivo generado no pasa por Prettier (está en `.prettierignore`): cada zona ocupa unas pocas
líneas largas y el diff sigue siendo legible por zona.
