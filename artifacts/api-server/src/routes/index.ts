import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tiendasRouter from "./tiendas";
import mensajesRouter from "./mensajes";
import pushTokensRouter from "./pushTokens";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tiendasRouter);
router.use(mensajesRouter);
router.use(pushTokensRouter);

export default router;
