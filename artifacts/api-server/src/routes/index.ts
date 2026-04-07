import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tiendasRouter from "./tiendas";
import productosRouter from "./productos";
import ventasRouter from "./ventas";
import ordenesRouter from "./ordenes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tiendasRouter);
router.use(productosRouter);
router.use(ventasRouter);
router.use(ordenesRouter);

export default router;
