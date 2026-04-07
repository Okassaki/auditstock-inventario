import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tiendasRouter from "./tiendas";
import mensajesRouter from "./mensajes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tiendasRouter);
router.use(mensajesRouter);

export default router;
