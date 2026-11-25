import { Card, Col, Flex, Row, Tag, theme, Typography } from "antd";
import { CalendarOutlined, CreditCardOutlined, HomeOutlined, TeamOutlined, ThunderboltOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Paragraph, Text } = Typography;

interface UpcomingResidencyLandingProps {
  fullName: string;
  address: string | null;
  startDate: string;
  isMainMember: boolean;
}

const UpcomingResidencyLanding: React.FC<UpcomingResidencyLandingProps> = ({
  fullName,
  address,
  startDate,
  isMainMember,
}) => {
  const { token } = theme.useToken();
  const formattedDate = dayjs(startDate).format("D MMMM YYYY");

  const steps = [
    {
      icon: <CreditCardOutlined />,
      title: "1. Register your charging card",
      description: `Starting ${formattedDate}, hold your RFID charging card against a charger in the building. It will appear in this portal so you can link it to your account in one click and give it a name.`,
    },
    {
      icon: <ThunderboltOutlined />,
      title: "2. Charge with clear rates",
      description:
        "Every session is tracked automatically with energy and cost. Off-peak (Dal) rates apply every night (21:00–07:00) and all weekend, and you can follow live charger status and monthly totals here.",
    },
    {
      icon: <TeamOutlined />,
      title: "3. Household & billing",
      description: isMainMember
        ? "As the main member of your household, you receive invoices and updates for all sessions at your address. You can already invite household members below so they are ready with their own cards."
        : "Your charging sessions are billed together with your household. Invoices and updates go to the main member of your household.",
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Card>
        <Flex vertical gap={12}>
          <Flex align="center" gap={8} wrap>
            <Tag color="processing" icon={<CalendarOutlined />}>
              Charging starts on {formattedDate}
            </Tag>
            {address && (
              <Tag icon={<HomeOutlined />}>
                {address}
              </Tag>
            )}
          </Flex>
          <Title level={3} style={{ margin: 0 }}>
            Welcome to Charger, {fullName}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 15 }}>
            Your account is active and ready for your move-in. You can start registering cards and charging your vehicle
            from <Text strong>{formattedDate}</Text>. Until then, charging stations will not authorize your cards yet.
          </Paragraph>
        </Flex>
      </Card>

      <Row gutter={[16, 16]}>
        {steps.map((step) => (
          <Col xs={24} md={8} key={step.title}>
            <Card style={{ height: "100%" }}>
              <Flex vertical gap={12}>
                <span
                  className="status-icon"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    fontSize: 18,
                    color: token.colorPrimary,
                    background: token.colorPrimaryBg,
                  }}
                >
                  {step.icon}
                </span>
                <Text strong style={{ fontSize: 16 }}>
                  {step.title}
                </Text>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {step.description}
                </Paragraph>
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>
    </Flex>
  );
};

export default UpcomingResidencyLanding;
