Instrucciones para el demo admin y restaurante

- Usuario demo:
  - id: USR-ADMIN-DEMO
  - email: demoadmin@soulfudy.com
  - password: DemoAdmin2026!
  - role: ADMIN
  - restaurantIds: [DEMO_RESTAURANT]

- Restaurante demo:
  - id: DEMO_RESTAURANT
  - name: Demo Restaurante

Cómo eliminar el demo:
1. Abrir `src/app/core/seed-data.ts` y eliminar las entradas de `DEMO_RESTAURANT` y `USR-ADMIN-DEMO`.
2. Abrir `src/app/core/models.ts` y eliminar `'DEMO_RESTAURANT'` del tipo `RestaurantId`.
3. Buscar y eliminar referencias en la base de datos si ya fue sembrado en Firebase.

Cómo actualizar credenciales:
- Modificar `seed-data.ts` con los nuevos valores y re-sembrar o actualizar manualmente en Firebase.

Notas:
- Estas entradas se añadieron sólo en `seed-data.ts` y en los tipos de `models.ts`.
- Si la app ya ha sincronizado datos con Firebase, será necesario actualizar/eliminar desde Firebase Console o mediante scripts.
