import { Card, Empty, Flex, Tag, theme, Typography } from "antd";
import { CreditCardOutlined } from "@ant-design/icons";
import type { Card as CardType } from "../services/cardService";
import { formatInteger } from "../utils/format";

const { Text } = Typography;

interface MyCardsCardProps {
  cards: CardType[];
  loading: boolean;
  onRename: (rfid: string, name: string) => void;
  readOnly?: boolean;
}

const MyCardsCard: React.FC<MyCardsCardProps> = ({ cards, loading, onRename, readOnly = false }) => {
  const { token } = theme.useToken();

  return (
    <Card
      title={
        <span>
          <CreditCardOutlined style={{ marginRight: 8 }} />
          My cards
        </span>
      }
      extra={<Tag>{formatInteger(cards.length)}</Tag>}
      loading={loading}
      style={{ height: "100%" }}
    >
      {cards.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No cards linked to your account yet" />
      ) : (
        <Flex vertical gap={12}>
          {cards.map((card) => (
            <Flex key={card.rfid} align="center" gap={12}>
              <span
                className="status-icon"
                style={{ width: 40, height: 40, borderRadius: 12, fontSize: 18, color: token.colorPrimary, background: token.colorPrimaryBg }}
              >
                <CreditCardOutlined />
              </span>
              <Flex vertical style={{ minWidth: 0, flex: 1 }}>
                <Text
                  strong
                  editable={
                    readOnly
                      ? false
                      : {
                          text: card.name,
                          tooltip: "Rename card",
                          onChange: (name) => {
                            const trimmed = name.trim();
                            if (trimmed && trimmed !== card.name) {
                              onRename(card.rfid, trimmed);
                            }
                          },
                        }
                  }
                >
                  {card.name || "Unnamed card"}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, fontFamily: token.fontFamilyCode }}>
                  {card.rfid}
                </Text>
              </Flex>
              {card.enabled === false && <Tag color="error">Disabled by a manager</Tag>}
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  );
};

export default MyCardsCard;
