// Shared by the maintenance Worker and local reset verification.
export function buildResetPlan({ tables, triggers, foreignKeys }) {
  const quote = (name) => {
    if (!/^[a-z_][a-z0-9_]*$/iu.test(name)) throw new Error("Unexpected schema identifier.");
    return `"${name}"`;
  };
  const remaining = new Set(tables);
  const order = [];
  while (remaining.size) {
    const children = [...remaining].filter(
      (table) => ![...remaining].some(
        (other) => other !== table && (foreignKeys[other] ?? []).includes(table),
      ),
    );
    if (!children.length) throw new Error("Cyclic schema dependencies; reset refused.");
    for (const table of children) {
      order.push(table);
      remaining.delete(table);
    }
  }
  return [
    ...triggers.map((trigger) => `DROP TRIGGER ${quote(trigger.name)}`),
    ...order.map((table) => `DELETE FROM ${quote(table)}`),
    ...triggers.map((trigger) => trigger.sql),
  ];
}
