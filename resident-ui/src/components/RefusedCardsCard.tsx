import { Button, Card, Empty, Flex, Popconfirm, theme, Typography } from "antd";
import { PlusOutlined, StopOutlined } from "@ant-design/icons";
import type { RefusedCard } from "../services/cardService";
import { parseUtc } from "../utils/dates";

const { Text } = Typography;

interface RefusedCardsCardProps {
  refusedCards: RefusedCard[];
  onAdd: (stationId: string) => void;
}

const RefusedCardsCard: React.FC<RefusedCardsCardProps> = ({ refusedCards, onAdd }) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={
        <span>
          <StopOutlined style={{ marginRight: 8 }} />
          Refused cards
        </span>
      }
      style={{ height: "100%" }}
    >
      {refusedCards.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No refused cards. When a charger refuses your card, it shows up here so you can add it."
        />
      ) : (
        <Flex vertical gap={12}>
          {refusedCards.map((item) => (
            <Flex key={item.id} align="center" gap={12} wrap>
              <span
                className="status-icon"
                style={{ width: 40, height: 40, borderRadius: 12, fontSize: 18, color: token.colorError, background: token.colorErrorBg }}
              >
                <StopOutlined />
              </span>
              <Flex vertical style={{ minWidth: 0, flex: 1 }}>
                <Text strong>Refused at {item.station_id}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <span style={{ fontFamily: token.fontFamilyCode }}>{item.rfid}</span> · {parseUtc(item.created).toLocaleString()}
                </Text>
              </Flex>
              <Popconfirm
                title="Add this card?"
                description={`The card last refused at ${item.station_id} will be linked to your account.`}
                okText="Add card"
                onConfirm={() => onAdd(item.station_id)}
              >
                <Button type="primary" ghost icon={<PlusOutlined />}>
                  Add as my card
                </Button>
              </Popconfirm>
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  );
};

export default RefusedCardsCard;
