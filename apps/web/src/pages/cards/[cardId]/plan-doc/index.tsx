import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import PlanDocView from "~/views/planDoc";

const PlanDocPage: NextPageWithLayout = () => {
  return (
    <>
      <PlanDocView />
      <Popup />
    </>
  );
};

PlanDocPage.getLayout = (page) => getDashboardLayout(page);

export default PlanDocPage;
