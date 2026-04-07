import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tiendasRouter from "./tiendas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tiendasRouter);

export default router;
