import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tiendasRouter from "./tiendas";
import mensajesRouter from "./mensajes";
import pushTokensRouter from "./pushTokens";
import uploadRouter from "./upload";
import callsRouter from "./calls";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tiendasRouter);
router.use(mensajesRouter);
router.use(pushTokensRouter);
router.use(uploadRouter);
router.use(callsRouter);

export default router;
