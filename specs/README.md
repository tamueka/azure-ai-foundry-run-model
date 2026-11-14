# Specs — Spec-Driven Development (SDD)

Este directorio es la **fuente de verdad** del proyecto. El código se escribe
*después* de la spec y se valida contra sus criterios de aceptación.

> Visión general del proyecto: [`../README.md`](../README.md).
> Runbook de ejecución: [`../INSTRUCTIONS.md`](../INSTRUCTIONS.md).

## Convención

```
specs/
  NNN-nombre-corto/
    spec.md        # QUÉ y POR QUÉ: requisitos, criterios de aceptación, no-objetivos
    plan.md        # CÓMO: arquitectura, decisiones, riesgos, pruebas
    tasks.md       # orden de implementación, verificable
    contracts/     # interfaces normativas (CLI, puertos, esquemas JSON)
```

- `NNN` es un número secuencial de tres dígitos (`001`, `002`, …).
- Una spec **no se edita** para reflejar la implementación; si el comportamiento
  cambia, se escribe una spec nueva y se enlaza desde la anterior.

## Flujo

1. **Spec** — requisitos verificables, incluidos los no-objetivos.
2. **Plan** — decisiones técnicas y riesgos.
3. **Tasks** — pasos pequeños con su comando de verificación.
4. **Implementar** — código mínimo que satisface la spec.
5. **Verificar** — AC uno a uno; `npm run typecheck && npm test`.
6. **Cerrar** — estado `Aprobada` → `Implementada` en la cabecera.

## Estados

| Estado | Significado |
|---|---|
| `Borrador` | En discusión, no se implementa |
| `Aprobada` | Lista para implementar |
| `Implementada` | Código y AC verificados |
| `Obsoleta` | Sustituida por otra spec |

## Índice

| Spec | Título | Estado |
|---|---|---|
| [001](001-run-model-cli/spec.md) | CLI `run-model` (hexagonal lite) | Implementada (auditada 2026-11-14) |
| [002](002-multi-turno/spec.md) | Conversación multi-turno (`chat`) | Implementada (auditada 2026-11-14) |

## Reglas

1. Ninguna tarea se marca hecha sin su verificación (ver `tasks.md`).
2. Los contratos de `contracts/` son normativos: si el código diverge, gana el contrato.
3. Los criterios de aceptación usan Given/When/Then y son ejecutables.
4. Todo no-objetivo explícito evita discusiones de alcance posteriores.

Opcionalmente se puede trabajar con [GitHub spec-kit](https://github.com/github/spec-kit)
(`/specify`, `/plan`, `/tasks`, `/implement`); esta estructura es compatible.