// Product builds use Vite's production mode. The preserved experimental
// interfaces are available only in an explicitly selected development build.
export const experimental = import.meta.env.MODE === "experimental";
