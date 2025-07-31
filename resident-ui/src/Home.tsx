import { useState, useEffect } from "react";
import { Layout, Menu, message, List, Button, Table, Card, Space, Typography } from "antd";
import { HomeOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";
import { getCurrentResidentTransactions, ChargeTransaction } from "./services/chargeTransactionService";

const { Content } = Layout;
const { Text } = Typography;

interface Card {
  rfid: string;
  resident_id: number;
}

const Home: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [refusedCards, setRefusedCards] = useState<Array<{station_id: string; timestamp: string}>>([]);
  const [chargeTransactions, setChargeTransactions] = useState<ChargeTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalTransactions, setTotalTransactions] = useState(0);

  const fetchMyCards = () => {
    fetch(`${API_BASE_URL}/cards/my_cards`, {
      credentials: 'include', // Include cookies for authentication
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Failed to fetch cards');
      })
      .then(data => setMyCards(data.cards))
      .catch(error => console.error("Error fetching my cards:", error));
  };

  const fetchRefusedCards = () => {
    fetch(`${API_BASE_URL}/cards/refused`)
      .then(response => response.json())
      .then(data => setRefusedCards(data.refused_cards))
      .catch(error => console.error("Error fetching refused cards:", error));
  };

  const fetchChargeTransactions = async (page: number = 1, size: number = 10) => {
    setTransactionsLoading(true);
    try {
      const skip = (page - 1) * size;
      const response = await getCurrentResidentTransactions(skip, size);
      setChargeTransactions(response.transactions);
      setTotalTransactions(response.total);
      setCurrentPage(page);
      setPageSize(size);
    } catch (error) {
      console.error("Error fetching charge transactions:", error);
      message.error("Failed to load charge transactions");
    } finally {
      setTransactionsLoading(false);
    }
  };

  useEffect(() => {
    fetchMyCards();
    fetchRefusedCards();
    fetchChargeTransactions();
  }, []);

  const handleAddCard = (stationId: string) => {
    fetch(`${API_BASE_URL}/cards/add_card/${stationId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to add card");
        }
        return response.json();
      })
      .then(() => {
        message.success("Card added successfully");
        // Refresh both lists after successful addition
        fetchMyCards();
        fetchRefusedCards();
      })
      .catch(error => {
        console.error("Error adding card:", error);
        message.error("Failed to add card");
      });
  };

  const handleTableChange = (pagination: { current?: number; pageSize?: number }) => {
    fetchChargeTransactions(pagination.current || 1, pagination.pageSize || 10);
  };

  const transactionColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: number) => <Text code>{id}</Text>,
    },
    {
      title: 'Station',
      dataIndex: 'station_id',
      key: 'station_id',
      render: (stationId: string) => <Text strong>{stationId}</Text>,
    },
    {
      title: 'RFID',
      dataIndex: 'rfid',
      key: 'rfid',
      render: (rfid: string) => (
        <Text code style={{ fontSize: '12px' }}>{rfid}</Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'created',
      key: 'created',
      render: (created: string) => (
        <Text>{new Date(created).toLocaleDateString()}</Text>
      ),
    },
    {
      title: 'Time',
      dataIndex: 'created',
      key: 'created_time',
      render: (created: string) => (
        <Text>{new Date(created).toLocaleTimeString()}</Text>
      ),
    },
    {
      title: 'Energy (kWh)',
      dataIndex: 'final_energy_kwh',
      key: 'final_energy_kwh',
      render: (energy: number | null) => (
        <Text type={energy ? 'success' : 'secondary'}>
          {energy ? `${Math.round(energy)} kWh` : 'N/A'}
        </Text>
      ),
    },
  ];

  return (
    <Layout style={{ 
      minHeight: "100vh",
      maxWidth: "800px",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column"
    }}>
      <Content style={{ 
        flex: 1,
        padding: "16px",
        overflowY: "auto",
        backgroundColor: "#fff"
      }}>
        {activeTab === "home" && (
          <div>
            <h1 style={{ 
              fontSize: "24px",
              marginBottom: "16px"
            }}>
              Charge APT
            </h1>
            
            {/* Charges Card - Full Width */}
            <Card
              title={
                <Space>
                  <ThunderboltOutlined />
                  <span>Charges</span>
                </Space>
              }
              style={{ marginBottom: "24px" }}
            >
              <Table
                dataSource={chargeTransactions}
                columns={transactionColumns}
                rowKey="id"
                loading={transactionsLoading}
                pagination={{
                  current: currentPage,
                  pageSize: pageSize,
                  total: totalTransactions,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => 
                    `${range[0]}-${range[1]} of ${total} transactions`,
                  pageSizeOptions: ['5', '10', '20', '50'],
                }}
                onChange={handleTableChange}
                size="small"
                bordered
                locale={{ 
                  emptyText: 'No charge transactions found'
                }}
                scroll={{ x: 800 }}
              />
            </Card>

            {/* Responsive Layout for My Cards and Refused Cards */}
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "16px",
              marginBottom: "24px"
            }}>
              {/* My Cards Card - Smaller */}
              <Card
                title={
                  <Space>
                    <span>My Cards</span>
                  </Space>
                }
                style={{ flex: "0 0 auto" }}
              >
                <Table
                  dataSource={myCards}
                  columns={[
                    {
                      title: 'RFID',
                      dataIndex: 'rfid',
                      key: 'rfid',
                      render: (rfid: string) => (
                        <span style={{ fontFamily: 'monospace' }}>{rfid}</span>
                      ),
                    },
                    {
                      title: 'Resident ID',
                      dataIndex: 'resident_id',
                      key: 'resident_id',
                    },
                  ]}
                  pagination={false}
                  size="small"
                  bordered
                  locale={{ emptyText: 'No cards found' }}
                />
              </Card>

              {/* Refused Cards List */}
              <List
                header={<h3>Refused Cards</h3>}
                bordered
                dataSource={refusedCards}
                renderItem={item => (
                  <List.Item
                    actions={[<Button type="primary" onClick={() => handleAddCard(item.station_id)}>Add Card</Button>]}
                  >
                    <div>
                      <strong>Station:</strong> {item.station_id} <br />
                      <strong>Timestamp:</strong> {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </div>
        )}
      </Content>

      <Menu
        mode="horizontal"
        selectedKeys={[activeTab]}
        onClick={(e) => setActiveTab(e.key)}
        style={{
          position: "sticky",
          bottom: 0,
          width: "100%",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "center"
        }}
        items={[
          {
            key: "home",
            label: "Charge APT",
            icon: <HomeOutlined />
          }
        ]}
      />
    </Layout>
  );
};

export default Home;
