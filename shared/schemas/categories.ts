export type Category = {
  id: number;
  name: string;
  /** null = la comisión se ingresa a mano en cada venta */
  defaultCommissionRate: number | null;
  isActive: boolean;
};
