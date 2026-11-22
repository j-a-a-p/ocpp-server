import { Col, Row } from "antd";
import ChargerStatusCard from "./components/ChargerStatusCard";
import ChargeSummaryCards from "./components/ChargeSummaryCards";

const Dashboard: React.FC = () => (
  <Row gutter={[16, 16]}>
    <Col xs={24} xl={10}>
      <ChargerStatusCard />
    </Col>
    <Col xs={24} xl={14}>
      <ChargeSummaryCards />
    </Col>
  </Row>
);

export default Dashboard;
